import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { api } from '../api.js'
import { formatDay, isOverdue, useLoad } from '../hooks.js'
import { useAuth } from '../auth.jsx'
import TaskModal from '../components/TaskModal.jsx'
import { Avatar, Badge, Button, ErrorBanner, LabelChip, Modal, PRIORITIES, STATUSES, Spinner, inputClass } from '../components/ui.jsx'

const byPosition = (a, b) => a.position - b.position || Number(a.id) - Number(b.id)
const isColumn = (id) => STATUSES.some((s) => s.id === id)

// Sürüklenen görevin hedef sütununu ve o sütundaki ekleme sırasını bulur.
// index, taşınan görev hariç hedef listedeki konumdur (sunucudaki /move ile aynı anlam).
export function resolveMove(tasks, activeId, overId) {
  const task = tasks.find((t) => t.id === activeId)
  if (!task || activeId === overId) return null

  const overTask = tasks.find((t) => t.id === overId)
  const status = isColumn(overId) ? overId : overTask?.status
  if (!status) return null

  const column = tasks.filter((t) => t.status === status).sort(byPosition)
  const index = isColumn(overId) ? column.filter((t) => t.id !== task.id).length : column.findIndex((t) => t.id === overId)
  return { task, status, index }
}

// Taşımayı yerel listeye uygular: hedef sütun yeniden numaralandırılır.
export function applyMove(tasks, { task, status, index }) {
  const rest = tasks.filter((t) => t.status === status && t.id !== task.id).sort(byPosition)
  rest.splice(index, 0, { ...task, status })
  const moved = rest.map((t, i) => ({ ...t, position: i + 1 }))
  return [...tasks.filter((t) => t.status !== status && t.id !== task.id), ...moved]
}

export default function Board() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const project = useLoad(() => api.get(`/api/projects/${id}`), [id])
  const workspaceId = project.data?.project.workspaceId
  const workspace = useLoad(() => (workspaceId ? api.get(`/api/workspaces/${workspaceId}`) : Promise.resolve(null)), [workspaceId])
  const labelsLoad = useLoad(() => (workspaceId ? api.get(`/api/workspaces/${workspaceId}/labels`) : Promise.resolve(null)), [workspaceId])
  const tasksLoad = useLoad(() => api.get(`/api/projects/${id}/tasks?limit=100`), [id])

  const [modal, setModal] = useState(null) // { task, status }
  const [dragging, setDragging] = useState(null)
  const [boardError, setBoardError] = useState(null)
  const [filters, setFilters] = useState({ q: '', assignee: '', label: '' })
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const tasks = tasksLoad.data?.tasks
  const members = workspace.data?.members ?? []
  const labels = labelsLoad.data?.labels ?? []
  const role = workspace.data?.workspace.role

  const visible = useMemo(() => {
    if (!tasks) return []
    const q = filters.q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false
      if (filters.label && !t.labelIds.includes(filters.label)) return false
      if (filters.assignee === 'none') return t.assigneeId === null
      if (filters.assignee) return t.assigneeId === filters.assignee
      return true
    })
  }, [tasks, filters])

  if ((project.loading && !project.data) || (tasksLoad.loading && !tasksLoad.data)) return <Spinner />
  if (project.error || tasksLoad.error) {
    return (
      <div className="space-y-4">
        <ErrorBanner error={project.error ?? tasksLoad.error} />
        <Link to="/" className="text-sm font-semibold text-indigo-600">
          ← Çalışma alanlarına dön
        </Link>
      </div>
    )
  }

  const p = project.data.project
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]))
  const labelById = Object.fromEntries(labels.map((l) => [l.id, l]))

  function setTasks(next) {
    tasksLoad.setData({ ...tasksLoad.data, tasks: next })
  }

  // Kart bırakıldığında arayüz hemen güncellenir; sunucu reddederse eski haline döner.
  function onDragEnd({ active, over }) {
    setDragging(null)
    if (!over) return
    const move = resolveMove(tasks, active.id, over.id)
    if (!move) return

    const previous = tasks
    setTasks(applyMove(tasks, move))
    setBoardError(null)
    api.post(`/api/tasks/${move.task.id}/move`, { status: move.status, index: move.index }).catch((err) => {
      setTasks(previous)
      setBoardError(err)
    })
  }

  async function deleteProject() {
    try {
      await api.delete(`/api/projects/${p.id}`)
      navigate(`/alanlar/${p.workspaceId}`, { replace: true })
    } catch (err) {
      setBoardError(err)
      setConfirmingDelete(false)
    }
  }

  const activeTask = dragging && tasks.find((t) => t.id === dragging)

  return (
    <div>
      <Link to={`/alanlar/${p.workspaceId}`} className="text-sm font-medium text-slate-500 hover:text-slate-800">
        ← {workspace.data?.workspace.name ?? 'Çalışma alanı'}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
          {p.description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{p.description}</p>}
        </div>
        <div className="flex gap-2">
          {role === 'admin' && (
            <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmingDelete(true)}>
              Projeyi sil
            </Button>
          )}
          <Button onClick={() => setModal({ task: null, status: 'todo' })}>Yeni görev</Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input className={`${inputClass} !w-64`} type="search" placeholder="Görevlerde ara…" aria-label="Görevlerde ara" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className={`${inputClass} !w-52`} aria-label="Atanan kişiye göre filtrele" value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}>
          <option value="">Tüm kişiler</option>
          <option value={user.id}>Bana atananlar</option>
          <option value="none">Atanmamışlar</option>
          {members
            .filter((m) => m.id !== user.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        {labels.length > 0 && (
          <select className={`${inputClass} !w-44`} aria-label="Etikete göre filtrele" value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })}>
            <option value="">Tüm etiketler</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <ErrorBanner error={boardError} />
        {tasksLoad.data.total > tasks.length && <p className="text-sm text-amber-700">Yalnızca ilk {tasks.length} görev gösteriliyor ({tasksLoad.data.total} görev var).</p>}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => setDragging(active.id)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {STATUSES.map((s) => (
            <Column
              key={s.id}
              status={s}
              tasks={visible.filter((t) => t.status === s.id).sort(byPosition)}
              memberById={memberById}
              labelById={labelById}
              onOpen={(task) => setModal({ task })}
              onAdd={() => setModal({ task: null, status: s.id })}
            />
          ))}
        </div>
        <DragOverlay>{activeTask && <TaskCard task={activeTask} assignee={memberById[activeTask.assigneeId]} labelById={labelById} overlay />}</DragOverlay>
      </DndContext>

      {modal && (
        <TaskModal
          task={modal.task}
          defaultStatus={modal.status}
          projectId={p.id}
          workspaceId={p.workspaceId}
          members={members}
          labels={labels}
          userId={user.id}
          role={role}
          onClose={() => setModal(null)}
          onLabelCreated={() => labelsLoad.reload()}
          onChanged={() => {
            setModal(null)
            tasksLoad.reload()
          }}
        />
      )}

      {confirmingDelete && (
        <Modal title="Projeyi sil" onClose={() => setConfirmingDelete(false)}>
          <p className="text-sm text-slate-600">
            <strong>{p.name}</strong> projesi ve içindeki tüm görevler kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={deleteProject}>
              Evet, sil
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Column({ status, tasks, memberById, labelById, onOpen, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })
  return (
    <section ref={setNodeRef} aria-label={status.label} className={`flex min-h-48 flex-col rounded-2xl p-3 ring-1 transition ${isOver ? 'bg-indigo-50 ring-indigo-300' : 'bg-slate-100/70 ring-slate-200'}`}>
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className={`size-2.5 rounded-full ${status.dot}`} />
          {status.label}
          <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200">{tasks.length}</span>
        </h2>
        <button onClick={onAdd} aria-label={`${status.label} sütununa görev ekle`} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-900">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="min-h-12 flex-1 space-y-2">
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} assignee={memberById[task.assigneeId]} labelById={labelById} onOpen={() => onOpen(task)} />
          ))}
        </ul>
      </SortableContext>
    </section>
  )
}

function SortableCard({ task, assignee, labelById, onOpen }) {
  const { setNodeRef, listeners, attributes, isDragging, transform, transition } = useSortable({ id: task.id })
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  }
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'opacity-30' : ''}>
      <TaskCard task={task} assignee={assignee} labelById={labelById} onOpen={onOpen} dragProps={{ ...listeners, ...attributes }} />
    </li>
  )
}

function TaskCard({ task, assignee, labelById, onOpen, dragProps, overlay = false }) {
  const priority = PRIORITIES[task.priority]
  const overdue = isOverdue(task.dueDate, task.status)
  const labels = task.labelIds.map((id) => labelById[id]).filter(Boolean)
  return (
    <div
      {...dragProps}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen?.()
      }}
      role="button"
      tabIndex={0}
      className={`block w-full cursor-grab touch-manipulation rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300 focus-visible:outline-2 focus-visible:outline-indigo-600 ${overlay ? 'rotate-2 cursor-grabbing shadow-xl' : ''}`}
    >
      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={priority.className}>{priority.label}</Badge>
          {task.dueDate && <Badge className={overdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}>{formatDay(task.dueDate)}</Badge>}
        </div>
        {assignee && <Avatar name={assignee.name} />}
      </div>
    </div>
  )
}
