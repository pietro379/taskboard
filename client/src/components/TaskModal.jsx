import { useState } from 'react'
import { api } from '../api.js'
import { formatDate, useLoad } from '../hooks.js'
import { Avatar, Button, ErrorBanner, Field, Modal, PRIORITIES, STATUSES, inputClass } from './ui.jsx'

// task === null ise yeni görev oluşturulur, değilse mevcut görev düzenlenir.
export default function TaskModal({ task, defaultStatus = 'todo', projectId, members, userId, role, onClose, onChanged }) {
  const isNew = task === null
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? defaultStatus,
    priority: task?.priority ?? 'medium',
    assigneeId: task?.assigneeId ?? '',
    dueDate: task?.dueDate ?? '',
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canDelete = !isNew && (role === 'admin' || task.createdBy === userId)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Boş seçimler sunucuya null olarak gider (atamayı veya tarihi temizler).
  const toPayload = (f) => ({ ...f, assigneeId: f.assigneeId || null, dueDate: f.dueDate || null })

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = toPayload(form)
      if (isNew) {
        await api.post(`/api/projects/${projectId}/tasks`, payload)
      } else {
        // Yalnızca değişen alanlar gönderilir
        const original = toPayload({
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assigneeId: task.assigneeId ?? '',
          dueDate: task.dueDate ?? '',
        })
        const changes = Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== original[key]))
        if (Object.keys(changes).length > 0) await api.patch(`/api/tasks/${task.id}`, changes)
      }
      onChanged()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.delete(`/api/tasks/${task.id}`)
      onChanged()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? 'Yeni görev' : 'Görev detayı'} onClose={onClose} wide={!isNew}>
      <div className={isNew ? '' : 'grid gap-8 md:grid-cols-5'}>
        <form onSubmit={save} className="space-y-4 md:col-span-3">
          <ErrorBanner error={error} />
          <Field label="Başlık">
            <input className={inputClass} value={form.title} onChange={set('title')} required maxLength={200} autoFocus={isNew} />
          </Field>
          <Field label="Açıklama">
            <textarea className={inputClass} rows={4} maxLength={5000} value={form.description} onChange={set('description')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Durum">
              <select className={inputClass} value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Öncelik">
              <select className={inputClass} value={form.priority} onChange={set('priority')}>
                {Object.entries(PRIORITIES).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Atanan kişi">
              <select className={inputClass} value={form.assigneeId} onChange={set('assigneeId')}>
                <option value="">Atanmamış</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Son tarih">
              <input className={inputClass} type="date" value={form.dueDate} onChange={set('dueDate')} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div>
              {canDelete &&
                (confirmDelete ? (
                  <span className="flex items-center gap-2">
                    <Button type="button" variant="danger" onClick={remove} disabled={busy}>
                      Evet, sil
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Vazgeç
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                    Görevi sil
                  </Button>
                ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Kapat
              </Button>
              <Button type="submit" disabled={busy}>
                {isNew ? 'Oluştur' : 'Kaydet'}
              </Button>
            </div>
          </div>
        </form>

        {!isNew && <Comments taskId={task.id} className="md:col-span-2" />}
      </div>
    </Modal>
  )
}

function Comments({ taskId, className = '' }) {
  const { data, error, reload } = useLoad(() => api.get(`/api/tasks/${taskId}/comments`), [taskId])
  const [body, setBody] = useState('')
  const [postError, setPostError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function post(e) {
    e.preventDefault()
    setBusy(true)
    setPostError(null)
    try {
      await api.post(`/api/tasks/${taskId}/comments`, { body })
      setBody('')
      reload()
    } catch (err) {
      setPostError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={className} aria-label="Yorumlar">
      <h3 className="mb-3 text-sm font-semibold">Yorumlar</h3>
      <ErrorBanner error={error} />
      <ul className="max-h-72 space-y-3 overflow-y-auto">
        {data?.comments.length === 0 && <li className="text-sm text-slate-500">Henüz yorum yok.</li>}
        {data?.comments.map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar name={c.authorName} />
            <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">
                <strong className="font-semibold text-slate-700">{c.authorName}</strong> · {formatDate(c.createdAt)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={post} className="mt-3 space-y-2">
        <ErrorBanner error={postError} />
        <textarea className={inputClass} rows={2} maxLength={2000} placeholder="Yorum yaz…" aria-label="Yorum" value={body} onChange={(e) => setBody(e.target.value)} required />
        <Button type="submit" variant="secondary" disabled={busy || !body.trim()}>
          Gönder
        </Button>
      </form>
    </section>
  )
}
