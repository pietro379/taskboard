import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { Avatar, Button, Spinner } from './ui.jsx'

// Giriş yapmamış kullanıcıları giriş sayfasına yönlendirir; giriş sonrası geri dönülür.
export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()

  if (user === undefined) return <Spinner />
  if (user === null) return <Navigate to="/giris" state={{ from: location.pathname }} replace />

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">T</span>
            Taskboard
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
              <Avatar name={user.name} />
              {user.name}
            </span>
            <Button variant="secondary" onClick={logout}>
              Çıkış yap
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
