import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskModal, { buildChanges } from './TaskModal.jsx'
import { api } from '../api.js'

vi.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const labels = [
  { id: '1', name: 'Hata', color: 'red' },
  { id: '2', name: 'Özellik', color: 'indigo' },
]
const members = [
  { id: '10', name: 'Elif Kaya' },
  { id: '11', name: 'Mert Yıldız' },
]
const existing = {
  id: '7',
  title: 'Mevcut görev',
  description: 'Ayrıntı',
  status: 'todo',
  priority: 'medium',
  assigneeId: '10',
  dueDate: '2026-12-01',
  labelIds: ['1'],
  createdBy: '10',
}

function setup(props = {}) {
  const handlers = { onClose: vi.fn(), onChanged: vi.fn(), onLabelCreated: vi.fn() }
  render(<TaskModal task={null} defaultStatus="todo" projectId="5" workspaceId="3" members={members} labels={labels} userId="10" role="admin" {...handlers} {...props} />)
  return { ...handlers, user: userEvent.setup() }
}

beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockResolvedValue({ comments: [] })
})

describe('buildChanges', () => {
  const form = { title: 'Mevcut görev', description: 'Ayrıntı', status: 'todo', priority: 'medium', assigneeId: '10', dueDate: '2026-12-01', labelIds: ['1'] }

  it('değişiklik yoksa boş nesne döner', () => {
    expect(buildChanges(existing, form)).toEqual({})
  })

  it('yalnızca değişen alanları döner', () => {
    expect(buildChanges(existing, { ...form, title: 'Yeni', priority: 'high' })).toEqual({ title: 'Yeni', priority: 'high' })
  })

  it('boş atama ve tarih null olarak gider', () => {
    expect(buildChanges(existing, { ...form, assigneeId: '', dueDate: '' })).toEqual({ assigneeId: null, dueDate: null })
  })

  it('etiket sırası değişse bile aynı küme değişiklik sayılmaz', () => {
    const task = { ...existing, labelIds: ['1', '2'] }
    expect(buildChanges(task, { ...form, labelIds: ['2', '1'] })).toEqual({})
    expect(buildChanges(task, { ...form, labelIds: ['2'] })).toEqual({ labelIds: ['2'] })
  })
})

describe('yeni görev', () => {
  it('formu doldurup görevi seçili sütun ve etiketle oluşturur', async () => {
    api.post.mockResolvedValue({ task: {} })
    const { user, onChanged } = setup({ defaultStatus: 'in_progress' })

    await user.type(screen.getByLabelText('Başlık'), 'Yeni görev')
    await user.click(screen.getByRole('button', { name: 'Hata' }))
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/api/projects/5/tasks', {
      title: 'Yeni görev',
      description: '',
      status: 'in_progress',
      priority: 'medium',
      assigneeId: null,
      dueDate: null,
      labelIds: ['1'],
    })
  })

  it('sunucu hatasını gösterir ve pencereyi kapatmaz', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('Atanan kişi bu çalışma alanının üyesi değil'), { status: 400 }))
    const { user, onChanged } = setup()

    await user.type(screen.getByLabelText('Başlık'), 'Görev')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Atanan kişi bu çalışma alanının üyesi değil')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('yeni etiket oluşturur ve göreve otomatik ekler', async () => {
    api.post.mockImplementation(async (path) => (path.endsWith('/labels') ? { label: { id: '9', name: 'Acil', color: 'indigo' } } : { task: {} }))
    const { user, onLabelCreated } = setup()

    await user.click(screen.getByRole('button', { name: '+ Yeni etiket' }))
    await user.type(screen.getByLabelText('Yeni etiket adı'), 'Acil')
    await user.click(screen.getByRole('button', { name: 'Ekle' }))

    await waitFor(() => expect(onLabelCreated).toHaveBeenCalledWith({ id: '9', name: 'Acil', color: 'indigo' }))
    expect(api.post).toHaveBeenCalledWith('/api/workspaces/3/labels', { name: 'Acil', color: 'indigo' })

    await user.type(screen.getByLabelText('Başlık'), 'Etiketli')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/projects/5/tasks', expect.objectContaining({ labelIds: ['9'] })))
  })

  it('etiket adındaki Enter görevi göndermez', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '+ Yeni etiket' }))
    await user.type(screen.getByLabelText('Yeni etiket adı'), 'x{Enter}')
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/api/workspaces/3/labels', expect.anything())
  })
})

describe('mevcut görev', () => {
  it('yalnızca değişen alanları PATCH ile gönderir', async () => {
    api.patch.mockResolvedValue({ task: {} })
    const { user, onChanged } = setup({ task: existing })

    const title = screen.getByLabelText('Başlık')
    await user.clear(title)
    await user.type(title, 'Güncel başlık')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(api.patch).toHaveBeenCalledWith('/api/tasks/7', { title: 'Güncel başlık' })
  })

  it('değişiklik yoksa istek atmadan kapanır', async () => {
    const { user, onChanged } = setup({ task: existing })
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('yorumları yükler ve yeni yorum gönderir', async () => {
    api.get.mockResolvedValue({ comments: [{ id: '1', body: 'İlk yorum', authorName: 'Mert Yıldız', createdAt: '2026-10-14T10:00:00Z' }] })
    api.post.mockResolvedValue({ comment: {} })
    const { user } = setup({ task: existing })

    expect(await screen.findByText('İlk yorum')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Yorum'), 'Teşekkürler')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/tasks/7/comments', { body: 'Teşekkürler' }))
  })

  it('silme iki adımlıdır: önce onay ister', async () => {
    api.delete.mockResolvedValue(null)
    const { user, onChanged } = setup({ task: existing })

    await user.click(screen.getByRole('button', { name: 'Görevi sil' }))
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Evet, sil' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(api.delete).toHaveBeenCalledWith('/api/tasks/7')
  })

  it('üye, başkasının görevi için silme düğmesini görmez; yönetici görür', () => {
    setup({ task: { ...existing, createdBy: '99' }, role: 'member' })
    expect(screen.queryByRole('button', { name: 'Görevi sil' })).not.toBeInTheDocument()
  })
})
