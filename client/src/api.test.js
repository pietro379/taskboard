import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, errorMessage, setUnauthorizedHandler, tokenStore } from './api.js'

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('api istemcisi', () => {
  const fetchMock = vi.fn()
  const onUnauthorized = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    setUnauthorizedHandler(onUnauthorized)
  })

  afterEach(() => {
    fetchMock.mockReset()
    onUnauthorized.mockReset()
    vi.unstubAllGlobals()
  })

  it('JSON gövdesini gönderir ve yanıtı döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true }))
    const result = await api.post('/api/workspaces', { name: 'Takım' })

    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/workspaces')
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ name: 'Takım' }) })
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('kayıtlı token varsa Authorization başlığı ekler', async () => {
    tokenStore.set('abc123')
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await api.get('/api/auth/me')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc123')
  })

  it('204 yanıtında null döner', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 })
    expect(await api.delete('/api/tasks/1')).toBeNull()
  })

  it('hata yanıtını ApiError olarak fırlatır', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'Geçersiz istek', details: [{ field: 'email', message: 'Geçerli bir e-posta girin' }] }))
    await expect(api.post('/api/auth/login', {})).rejects.toMatchObject({ status: 400, message: 'Geçersiz istek' })
  })

  it('ağ hatasını anlaşılır bir ApiError ile bildirir', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await api.get('/api/workspaces').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })

  it('token varken gelen 401 oturumu sonlandırır', async () => {
    tokenStore.set('eski-token')
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Oturum geçersiz' }))
    await expect(api.get('/api/workspaces')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('token yokken gelen 401 (hatalı giriş) oturum kapatma tetiklemez', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'E-posta veya şifre hatalı' }))
    await expect(api.post('/api/auth/login', {})).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('errorMessage', () => {
  it('alan hatalarını mesaja ekler', () => {
    const error = new ApiError(400, 'Geçersiz istek', [{ message: 'Şifre en az 8 karakter olmalı' }, { message: 'Geçerli bir e-posta girin' }])
    expect(errorMessage(error)).toBe('Geçersiz istek: Şifre en az 8 karakter olmalı · Geçerli bir e-posta girin')
  })

  it('ayrıntı yoksa yalnızca mesajı döner, hata yoksa boş metin', () => {
    expect(errorMessage(new ApiError(409, 'Bu e-posta zaten kayıtlı'))).toBe('Bu e-posta zaten kayıtlı')
    expect(errorMessage(null)).toBe('')
  })
})
