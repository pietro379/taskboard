import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { Button, ErrorBanner, Field, Spinner, inputClass } from '../components/ui.jsx'

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (user === undefined) return <Spinner />
  if (user) return <Navigate to={location.state?.from ?? '/'} replace />

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isRegister) await register(form.name, form.email, form.password)
      else await login(form.email, form.password)
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-indigo-600 text-xl font-bold text-white">T</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{isRegister ? 'Hesap oluştur' : 'Tekrar hoş geldin'}</h1>
          <p className="mt-1 text-sm text-slate-600">{isRegister ? 'Takımınla çalışmaya başla' : 'Taskboard hesabınla giriş yap'}</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <ErrorBanner error={error} />
          {isRegister && (
            <Field label="Ad soyad">
              <input className={inputClass} value={form.name} onChange={set('name')} required minLength={2} maxLength={80} autoComplete="name" autoFocus />
            </Field>
          )}
          <Field label="E-posta">
            <input className={inputClass} type="email" value={form.email} onChange={set('email')} required autoComplete="email" autoFocus={!isRegister} />
          </Field>
          <Field label="Şifre">
            <input
              className={inputClass}
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={isRegister ? 8 : 1}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
            {isRegister && <span className="mt-1 block text-xs text-slate-500">En az 8 karakter</span>}
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Lütfen bekleyin…' : isRegister ? 'Kayıt ol' : 'Giriş yap'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {isRegister ? 'Zaten hesabın var mı?' : 'Hesabın yok mu?'}{' '}
          <Link to={isRegister ? '/giris' : '/kayit'} state={location.state} className="font-semibold text-indigo-600 hover:text-indigo-500">
            {isRegister ? 'Giriş yap' : 'Kayıt ol'}
          </Link>
        </p>
      </div>
    </div>
  )
}
