import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createUserRepo } from '../src/repos/users.js'
import { hasDb, setupTestDb } from './helpers/db.js'

describe.skipIf(!hasDb)('etiketler ve görev sıralama', () => {
  let testDb
  let app
  let alice // yönetici
  let bob // üye
  let carol // dışarıda
  let workspaceId
  let projectId

  const as = (token) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  })

  async function register(name) {
    const res = await request(app).post('/api/auth/register').send({ email: `${name}@example.com`, name, password: 'sifre12345' })
    return { id: res.body.user.id, token: res.body.token, email: `${name}@example.com` }
  }

  const createTask = async (token, title, extra = {}) => (await as(token).post(`/api/projects/${projectId}/tasks`, { title, ...extra })).body.task
  const column = async (status) => (await as(alice.token).get(`/api/projects/${projectId}/tasks?status=${status}`)).body.tasks.map((t) => t.title)

  beforeAll(async () => {
    testDb = await setupTestDb()
    app = createApp({ users: createUserRepo(testDb.pool), db: testDb.pool })
    ;[alice, bob, carol] = [await register('alice'), await register('bob'), await register('carol')]
    workspaceId = (await as(alice.token).post('/api/workspaces', { name: 'Etiket Takımı' })).body.workspace.id
    await as(alice.token).post(`/api/workspaces/${workspaceId}/members`, { email: bob.email })
    projectId = (await as(alice.token).post(`/api/workspaces/${workspaceId}/projects`, { name: 'Pano' })).body.project.id
  })

  afterAll(async () => {
    await testDb?.teardown()
  })

  describe('etiketler', () => {
    let bug
    let feature

    it('üye etiket oluşturur; aynı ad 409, geçersiz renk 400', async () => {
      const res = await as(bob.token).post(`/api/workspaces/${workspaceId}/labels`, { name: 'Hata', color: 'red' })
      expect(res.status).toBe(201)
      bug = res.body.label
      feature = (await as(bob.token).post(`/api/workspaces/${workspaceId}/labels`, { name: 'Özellik' })).body.label
      expect(feature.color).toBe('indigo')

      expect((await as(bob.token).post(`/api/workspaces/${workspaceId}/labels`, { name: 'Hata' })).status).toBe(409)
      expect((await as(bob.token).post(`/api/workspaces/${workspaceId}/labels`, { name: 'x', color: 'turuncu' })).status).toBe(400)
      expect((await as(bob.token).post(`/api/workspaces/${workspaceId}/labels`, { name: '   ' })).status).toBe(400)
    })

    it('dışarıdaki kişi etiketleri göremez ve oluşturamaz', async () => {
      expect((await as(carol.token).get(`/api/workspaces/${workspaceId}/labels`)).status).toBe(404)
      expect((await as(carol.token).post(`/api/workspaces/${workspaceId}/labels`, { name: 'Sızma' })).status).toBe(404)
      const list = await as(bob.token).get(`/api/workspaces/${workspaceId}/labels`)
      expect(list.body.labels.map((l) => l.name)).toEqual(['Hata', 'Özellik'])
    })

    it('göreve etiket eklenir, değiştirilir ve etikete göre filtrelenir', async () => {
      const task = await createTask(bob.token, 'Giriş hatası', { labelIds: [bug.id] })
      expect(task.labelIds).toEqual([bug.id])
      await createTask(bob.token, 'Etiketsiz görev')

      const updated = await as(bob.token).patch(`/api/tasks/${task.id}`, { labelIds: [bug.id, feature.id] })
      expect(updated.body.task.labelIds).toEqual([bug.id, feature.id])

      const filtered = await as(bob.token).get(`/api/projects/${projectId}/tasks?labelId=${feature.id}`)
      expect(filtered.body.tasks.map((t) => t.title)).toEqual(['Giriş hatası'])

      const replaced = await as(bob.token).patch(`/api/tasks/${task.id}`, { labelIds: [] })
      expect(replaced.body.task.labelIds).toEqual([])
    })

    it('başka çalışma alanının etiketi kullanılamaz', async () => {
      const otherWs = (await as(carol.token).post('/api/workspaces', { name: 'Başka Alan' })).body.workspace.id
      const foreign = (await as(carol.token).post(`/api/workspaces/${otherWs}/labels`, { name: 'Yabancı' })).body.label
      const res = await as(bob.token).post(`/api/projects/${projectId}/tasks`, { title: 'Kötü etiket', labelIds: [foreign.id] })
      expect(res.status).toBe(400)
      const task = await createTask(bob.token, 'Temiz görev')
      expect((await as(bob.token).patch(`/api/tasks/${task.id}`, { labelIds: [foreign.id] })).status).toBe(400)
      expect((await as(bob.token).patch(`/api/tasks/${task.id}`, { labelIds: ['1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1'] })).status).toBe(400)
    })

    it('yalnızca yönetici etiket siler; silinen etiket görevlerden de kalkar', async () => {
      const task = await createTask(bob.token, 'Etiketli görev', { labelIds: [bug.id] })
      expect((await as(bob.token).delete(`/api/labels/${bug.id}`)).status).toBe(403)
      expect((await as(carol.token).delete(`/api/labels/${bug.id}`)).status).toBe(404)
      expect((await as(alice.token).delete(`/api/labels/${bug.id}`)).status).toBe(204)

      const after = await as(bob.token).get(`/api/tasks/${task.id}`)
      expect(after.body.task.labelIds).toEqual([])
    })
  })

  describe('görev sıralama', () => {
    let a
    let b
    let c

    it('sütun içinde yeniden sıralar', async () => {
      ;[a, b, c] = [await createTask(alice.token, 'A', { status: 'in_progress' }), await createTask(alice.token, 'B', { status: 'in_progress' }), await createTask(alice.token, 'C', { status: 'in_progress' })]
      expect(await column('in_progress')).toEqual(['A', 'B', 'C'])

      const moved = await as(bob.token).post(`/api/tasks/${c.id}/move`, { status: 'in_progress', index: 0 })
      expect(moved.status).toBe(200)
      expect(moved.body.tasks.map((t) => t.title)).toEqual(['C', 'A', 'B'])
      expect(await column('in_progress')).toEqual(['C', 'A', 'B'])
    })

    it('başka sütuna istenen sıraya taşır', async () => {
      await as(alice.token).post(`/api/tasks/${a.id}/move`, { status: 'done', index: 0 })
      const done = await as(alice.token).post(`/api/tasks/${b.id}/move`, { status: 'done', index: 0 })
      expect(done.body.tasks.map((t) => t.title)).toEqual(['B', 'A'])
      expect(done.body.tasks.every((t) => t.status === 'done')).toBe(true)
      expect(await column('in_progress')).toEqual(['C'])
    })

    it('sütun uzunluğunu aşan indeks sona ekler; konumlar ardışık olur', async () => {
      const res = await as(alice.token).post(`/api/tasks/${c.id}/move`, { status: 'done', index: 99 })
      expect(res.body.tasks.map((t) => t.title)).toEqual(['B', 'A', 'C'])
      expect(res.body.tasks.map((t) => t.position)).toEqual([1, 2, 3])
    })

    it('yetkisiz ve geçersiz istekleri reddeder', async () => {
      expect((await as(carol.token).post(`/api/tasks/${a.id}/move`, { status: 'todo', index: 0 })).status).toBe(404)
      expect((await as(alice.token).post(`/api/tasks/${a.id}/move`, { status: 'bitti', index: 0 })).status).toBe(400)
      expect((await as(alice.token).post(`/api/tasks/${a.id}/move`, { status: 'todo', index: -1 })).status).toBe(400)
      expect((await as(alice.token).post(`/api/tasks/${a.id}/move`, { status: 'todo' })).status).toBe(400)
      expect((await as(alice.token).post('/api/tasks/abc/move', { status: 'todo', index: 0 })).status).toBe(404)
    })

    it('taşıma etkinlik geçmişine yazılır', async () => {
      const res = await as(alice.token).get(`/api/workspaces/${workspaceId}/activity`)
      const actions = res.body.activity.map((x) => x.action)
      expect(actions).toEqual(expect.arrayContaining(['task.reordered', 'task.status_changed']))
    })
  })
})
