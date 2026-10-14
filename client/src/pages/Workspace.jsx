import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate, useLoad } from '../hooks.js'
import { useAuth } from '../auth.jsx'
import { Avatar, Badge, Button, ErrorBanner, Field, Modal, Spinner, inputClass } from '../components/ui.jsx'

const ACTIONS = {
  'workspace.created': 'çalışma alanını oluşturdu',
  'member.added': 'bir üye ekledi',
  'member.role_changed': 'bir üyenin rolünü değiştirdi',
  'member.removed': 'bir üyeyi çıkardı',
  'project.created': 'bir proje oluşturdu',
  'project.deleted': 'bir projeyi sildi',
  'task.created': 'bir görev oluşturdu',
  'task.updated': 'bir görevi güncelledi',
  'task.status_changed': 'bir görevin durumunu değiştirdi',
  'task.deleted': 'bir görevi sildi',
}

export default function Workspace() {
  const { id } = useParams()
  const workspace = useLoad(() => api.get(`/api/workspaces/${id}`), [id])
  const projects = useLoad(() => api.get(`/api/workspaces/${id}/projects`), [id])
  const activity = useLoad(() => api.get(`/api/workspaces/${id}/activity`), [id])
  const [creating, setCreating] = useState(false)

  if (workspace.loading && !workspace.data) return <Spinner />
  if (workspace.error) {
    return (
      <div className="space-y-4">
        <ErrorBanner error={workspace.error} />
        <Link to="/" className="text-sm font-semibold text-indigo-600">
          ← Çalışma alanlarına dön
        </Link>
      </div>
    )
  }

  const { workspace: ws, members } = workspace.data
  const isAdmin = ws.role === 'admin'
  const refreshMembers = () => {
    workspace.reload()
    activity.reload()
  }

  return (
    <div>
      <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Çalışma alanları
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{ws.name}</h1>
        <Button onClick={() => setCreating(true)}>Yeni proje</Button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Projeler</h2>
          {projects.loading && !projects.data && <Spinner />}
          <ErrorBanner error={projects.error} />
          {projects.data?.projects.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center">
              <p className="font-semibold">Henüz proje yok</p>
              <p className="mt-1 text-sm text-slate-600">İlk projeni oluşturup görevleri panoya ekle.</p>
            </div>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.data?.projects.map((p) => (
              <li key={p.id}>
                <Link to={`/projeler/${p.id}`} className="block h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-indigo-300">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
                  <p className="mt-3 text-xs text-slate-500">{p.taskCount} görev</p>
                </Link>
              </li>
            ))}
          </ul>

          <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">Son etkinlikler</h2>
          {activity.data?.activity.length === 0 && <p className="text-sm text-slate-500">Henüz etkinlik yok.</p>}
          <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
            {activity.data?.activity.slice(0, 10).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>
                  <strong className="font-semibold">{a.actorName}</strong> {ACTIONS[a.action] ?? a.action}
                </span>
                <time className="shrink-0 text-xs text-slate-500" dateTime={a.createdAt}>
                  {formatDate(a.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </section>

        <MembersPanel workspace={ws} members={members} isAdmin={isAdmin} onChange={refreshMembers} />
      </div>

      {creating && <CreateProject workspaceId={id} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); projects.reload(); activity.reload() }} />}
    </div>
  )
}

function MembersPanel({ workspace, members, isAdmin, onChange }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)

  async function run(action) {
    setError(null)
    try {
      await action()
      onChange()
    } catch (err) {
      setError(err)
    }
  }

  async function add(e) {
    e.preventDefault()
    setBusy(true)
    await run(async () => {
      await api.post(`/api/workspaces/${workspace.id}/members`, { email, role })
      setEmail('')
    })
    setBusy(false)
  }

  return (
    <aside>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Üyeler ({members.length})</h2>
      <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
        {members.map((m) => {
          const isOwner = m.id === workspace.ownerId
          return (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name} {m.id === user.id && <span className="text-slate-400">(sen)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.email}</p>
              </div>
              {isOwner ? (
                <Badge className="bg-amber-100 text-amber-700">Sahip</Badge>
              ) : isAdmin ? (
                <div className="flex items-center gap-1">
                  <select
                    aria-label={`${m.name} rolü`}
                    value={m.role}
                    onChange={(e) => run(() => api.patch(`/api/workspaces/${workspace.id}/members/${m.id}`, { role: e.target.value }))}
                    className="rounded-md border-0 bg-slate-50 py-1 pl-2 pr-7 text-xs ring-1 ring-slate-300"
                  >
                    <option value="member">Üye</option>
                    <option value="admin">Yönetici</option>
                  </select>
                  {confirmId === m.id ? (
                    <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => run(() => api.delete(`/api/workspaces/${workspace.id}/members/${m.id}`))}>
                      Emin misin?
                    </Button>
                  ) : (
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setConfirmId(m.id)} aria-label={`${m.name} üyesini çıkar`}>
                      Çıkar
                    </Button>
                  )}
                </div>
              ) : (
                <Badge className="bg-slate-100 text-slate-600">{m.role === 'admin' ? 'Yönetici' : 'Üye'}</Badge>
              )}
            </li>
          )
        })}
      </ul>

      {isAdmin && (
        <form onSubmit={add} className="mt-4 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm font-semibold">Üye ekle</p>
          <ErrorBanner error={error} />
          <input className={inputClass} type="email" required placeholder="kayitli@eposta.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Üyenin e-postası" />
          <div className="flex gap-2">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} aria-label="Rol">
              <option value="member">Üye</option>
              <option value="admin">Yönetici</option>
            </select>
            <Button type="submit" disabled={busy}>
              Ekle
            </Button>
          </div>
          <p className="text-xs text-slate-500">Kişinin Taskboard hesabı olmalı.</p>
        </form>
      )}
      {!isAdmin && error && <ErrorBanner error={error} />}
    </aside>
  )
}

function CreateProject({ workspaceId, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post(`/api/workspaces/${workspaceId}/projects`, form)
      onCreated()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title="Yeni proje" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Proje adı">
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={100} autoFocus />
        </Field>
        <Field label="Açıklama (isteğe bağlı)">
          <textarea className={inputClass} rows={3} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Oluşturuluyor…' : 'Oluştur'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
