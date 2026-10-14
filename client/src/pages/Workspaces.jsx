import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useLoad } from '../hooks.js'
import { Badge, Button, ErrorBanner, Field, Modal, Spinner, inputClass } from '../components/ui.jsx'

export default function Workspaces() {
  const navigate = useNavigate()
  const { data, error, loading } = useLoad(() => api.get('/api/workspaces'), [])
  const [creating, setCreating] = useState(false)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Çalışma alanların</h1>
          <p className="mt-1 text-sm text-slate-600">Takımlarını ve projelerini buradan yönet.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Yeni çalışma alanı</Button>
      </div>

      <div className="mt-8">
        {loading && <Spinner />}
        <ErrorBanner error={error} />
        {data && data.workspaces.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center">
            <p className="font-semibold">Henüz bir çalışma alanın yok</p>
            <p className="mt-1 text-sm text-slate-600">İlk takımını oluşturup projelerini yönetmeye başla.</p>
            <Button className="mt-5" onClick={() => setCreating(true)}>
              Çalışma alanı oluştur
            </Button>
          </div>
        )}
        {data && data.workspaces.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.workspaces.map((w) => (
              <li key={w.id}>
                <Link to={`/alanlar/${w.id}`} className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-indigo-300">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{w.name}</h2>
                    <Badge className={w.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}>{w.role === 'admin' ? 'Yönetici' : 'Üye'}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && <CreateWorkspace onClose={() => setCreating(false)} onCreated={(w) => navigate(`/alanlar/${w.id}`)} />}
    </div>
  )
}

function CreateWorkspace({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { workspace } = await api.post('/api/workspaces', { name })
      onCreated(workspace)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title="Yeni çalışma alanı" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Alan adı">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="Örn. Ürün Takımı" autoFocus />
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
