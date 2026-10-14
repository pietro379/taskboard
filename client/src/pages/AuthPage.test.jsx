import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AuthPage from './AuthPage.jsx'
import { AuthProvider } from '../auth.jsx'
import { ApiError, api, tokenStore } from '../api.js'

vi.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

function renderAuth(mode, initialEntries = ['/giris']) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/giris" element={<AuthPage mode="login" />} />
          <Route path="/kayit" element={<AuthPage mode="register" />} />
          <Route path="/" element={<p>Ana sayfa</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('giriş sayfası', () => {
  it('doğru bilgilerle giriş yapar, token saklar ve ana sayfaya yönlendirir', async () => {
    api.post.mockResolvedValue({ token: 'jwt-token', user: { id: '1', name: 'Elif Kaya', email: 'elif@example.com' } })
    const user = renderAuth('login')

    await user.type(await screen.findByLabelText('E-posta'), 'elif@example.com')
    await user.type(screen.getByLabelText('Şifre'), 'sifre12345')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByText('Ana sayfa')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/auth/login', { email: 'elif@example.com', password: 'sifre12345' })
    expect(tokenStore.get()).toBe('jwt-token')
  })

  it('hatalı bilgide sunucu mesajını gösterir ve sayfada kalır', async () => {
    api.post.mockRejectedValue(new ApiError(401, 'E-posta veya şifre hatalı'))
    const user = renderAuth('login')

    await user.type(await screen.findByLabelText('E-posta'), 'elif@example.com')
    await user.type(screen.getByLabelText('Şifre'), 'yanlis')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya şifre hatalı')
    expect(screen.queryByText('Ana sayfa')).not.toBeInTheDocument()
    expect(tokenStore.get()).toBeNull()
  })

  it('kayıt sayfasına geçiş bağlantısı vardır', async () => {
    const user = renderAuth('login')
    await user.click(await screen.findByRole('link', { name: 'Kayıt ol' }))
    expect(await screen.findByRole('heading', { name: 'Hesap oluştur' })).toBeInTheDocument()
  })
})

describe('kayıt sayfası', () => {
  it('ad, e-posta ve şifreyle kayıt olur', async () => {
    api.post.mockResolvedValue({ token: 'yeni-token', user: { id: '2', name: 'Mert Yıldız', email: 'mert@example.com' } })
    const user = renderAuth('register', ['/kayit'])

    await user.type(await screen.findByLabelText('Ad soyad'), 'Mert Yıldız')
    await user.type(screen.getByLabelText('E-posta'), 'mert@example.com')
    // Kayıt formunda "En az 8 karakter" ipucu etiketin içindedir
    await user.type(screen.getByLabelText(/^Şifre/), 'sifre12345')
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }))

    await waitFor(() => expect(screen.getByText('Ana sayfa')).toBeInTheDocument())
    expect(api.post).toHaveBeenCalledWith('/api/auth/register', { name: 'Mert Yıldız', email: 'mert@example.com', password: 'sifre12345' })
  })
})

describe('oturum', () => {
  it('geçerli token varsa giriş sayfası doğrudan ana sayfaya yönlendirir', async () => {
    tokenStore.set('kayitli-token')
    api.get.mockResolvedValue({ user: { id: '1', name: 'Elif Kaya', email: 'elif@example.com' } })
    renderAuth('login')

    expect(await screen.findByText('Ana sayfa')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/auth/me')
  })

  it('token geçersizse temizlenir ve giriş formu görünür', async () => {
    tokenStore.set('suresi-dolmus')
    api.get.mockRejectedValue(new ApiError(401, 'Oturum geçersiz'))
    renderAuth('login')

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument()
    expect(tokenStore.get()).toBeNull()
  })
})
