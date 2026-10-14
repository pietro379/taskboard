import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Workspaces from './pages/Workspaces.jsx'
import Workspace from './pages/Workspace.jsx'
import Board from './pages/Board.jsx'

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="mt-3 text-slate-600">Aradığınız sayfa bulunamadı.</p>
      <Link to="/" className="mt-6 inline-block font-semibold text-indigo-600 hover:text-indigo-500">
        Ana sayfaya dön
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/giris" element={<AuthPage mode="login" />} />
      <Route path="/kayit" element={<AuthPage mode="register" />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Workspaces />} />
        <Route path="/alanlar/:id" element={<Workspace />} />
        <Route path="/projeler/:id" element={<Board />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
