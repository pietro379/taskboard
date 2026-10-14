import { useState } from 'react'
import { api } from '../api.js'
import { formatDate, useLoad } from '../hooks.js'
import { Avatar, Button, ErrorBanner, Field, LABEL_STYLES, Modal, PRIORITIES, STATUSES, inputClass } from './ui.jsx'

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id))

// Yalnızca değişen alanlardan oluşan güncelleme gövdesini üretir (boş seçimler null olarak gider).
export function buildChanges(task, form) {
  const next = { ...form, assigneeId: form.assigneeId || null, dueDate: form.dueDate || null }
  const original = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
  }
  const changes = Object.fromEntries(Object.entries(original).filter(([key, value]) => next[key] !== value).map(([key]) => [key, next[key]]))
  if (!sameSet(task.labelIds, form.labelIds)) changes.labelIds = form.labelIds
  return changes
}

// task === null ise yeni görev oluşturulur, değilse mevcut görev düzenlenir.
export default function TaskModal({ task, defaultStatus = 'todo', projectId, workspaceId, members, labels, userId, role, onClose, onChanged, onLabelCreated }) {
  const isNew = task === null
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? defaultStatus,
    priority: task?.priority ?? 'medium',
    assigneeId: task?.assigneeId ?? '',
    dueDate: task?.dueDate ?? '',
    labelIds: task?.labelIds ?? [],
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canDelete = !isNew && (role === 'admin' || task.createdBy === userId)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const toggleLabel = (id) => setForm((f) => ({ ...f, labelIds: f.labelIds.includes(id) ? f.labelIds.filter((x) => x !== id) : [...f.labelIds, id] }))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isNew) {
        await api.post(`/api/projects/${projectId}/tasks`, { ...form, assigneeId: form.assigneeId || null, dueDate: form.dueDate || null })
      } else {
        const changes = buildChanges(task, form)
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

          <LabelPicker
            workspaceId={workspaceId}
            labels={labels}
            selected={form.labelIds}
            onToggle={toggleLabel}
            onCreated={(label) => {
              onLabelCreated?.(label)
              setForm((f) => ({ ...f, labelIds: [...f.labelIds, label.id] }))
            }}
          />

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

function LabelPicker({ workspaceId, labels, selected, onToggle, onCreated }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', color: 'indigo' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!draft.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { label } = await api.post(`/api/workspaces/${workspaceId}/labels`, draft)
      onCreated(label)
      setDraft({ name: '', color: 'indigo' })
      setAdding(false)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">Etiketler</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((l) => {
          const on = selected.includes(l.id)
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(l.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${LABEL_STYLES[l.color]?.chip} ${on ? 'ring-2 ring-indigo-600' : 'opacity-60 hover:opacity-100'}`}
            >
              {l.name}
            </button>
          )
        })}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-full px-2.5 py-1 text-xs font-medium text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50">
            + Yeni etiket
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <ErrorBanner error={error} />
          <input
            className={inputClass}
            placeholder="Etiket adı"
            aria-label="Yeni etiket adı"
            maxLength={30}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => {
              // Enter, görev formunu göndermesin
              if (e.key === 'Enter') {
                e.preventDefault()
                create()
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5" role="radiogroup" aria-label="Etiket rengi">
              {Object.entries(LABEL_STYLES).map(([color, style]) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === color}
                  aria-label={color}
                  onClick={() => setDraft({ ...draft, color })}
                  className={`size-5 rounded-full ${style.dot} ${draft.color === color ? 'ring-2 ring-offset-2 ring-slate-900' : ''}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="!px-2 !py-1" onClick={() => setAdding(false)}>
                Vazgeç
              </Button>
              <Button type="button" className="!px-3 !py-1" onClick={create} disabled={busy || !draft.name.trim()}>
                Ekle
              </Button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
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
