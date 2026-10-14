import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createUserRepo } from '../src/repos/users.js'
import { hasDb, setupTestDb } from './helpers/db.js'

// Bu testler gerçek SQL ve yetki kurallarını geçici bir veritabanı şemasında dener.
// DATABASE_URL tanımlı değilse atlanır.
describe.skipIf(!hasDb)('çalışma alanı, proje ve görev akışı', () => {
  let testDb
  let app
  const users = {}

  // Belirli bir kullanıcı adına istek atan küçük yardımcı
  const as = (token) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  })

  async function register(name) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `${name}@example.com`, name, password: 'sifre12345' })
    return { id: res.body.user.id, token: res.body.token, email: `${name}@example.com` }
  }

  let alice // çalışma alanı sahibi ve yönetici
  let bob // üye
  let carol // çalışma alanının dışında
  let workspaceId
  let projectId

  beforeAll(async () => {
    testDb = await setupTestDb()
    app = createApp({ users: createUserRepo(testDb.pool), db: testDb.pool })
    ;[alice, bob, carol] = [await register('alice'), await register('bob'), await register('carol')]
    Object.assign(users, { alice, bob, carol })
  })

  afterAll(async () => {
    await testDb?.teardown()
  })

  describe('çalışma alanı', () => {
    it('oluşturan kişi yönetici olur', async () => {
      const res = await as(alice.token).post('/api/workspaces', { name: 'Ürün Takımı' })
      expect(res.status).toBe(201)
      expect(res.body.workspace.role).toBe('admin')
      workspaceId = res.body.workspace.id
    })

    it('geçersiz ad reddedilir', async () => {
      expect((await as(alice.token).post('/api/workspaces', { name: 'x' })).status).toBe(400)
    })

    it('kimliksiz istek 401 döner', async () => {
      expect((await request(app).get('/api/workspaces')).status).toBe(401)
    })

    it('üye olmayan kişi alanı göremez ve listesinde çıkmaz', async () => {
      expect((await as(carol.token).get(`/api/workspaces/${workspaceId}`)).status).toBe(404)
      expect((await as(carol.token).get('/api/workspaces')).body.workspaces).toEqual([])
    })

    it('geçersiz kimlik 404 döner', async () => {
      expect((await as(alice.token).get('/api/workspaces/abc')).status).toBe(404)
    })

    it('yönetici üye ekler; bilinmeyen e-posta 404, tekrar ekleme 409', async () => {
      const added = await as(alice.token).post(`/api/workspaces/${workspaceId}/members`, { email: bob.email })
      expect(added.status).toBe(201)
      expect(added.body.member.role).toBe('member')
      expect((await as(alice.token).post(`/api/workspaces/${workspaceId}/members`, { email: 'yok@example.com' })).status).toBe(404)
      expect((await as(alice.token).post(`/api/workspaces/${workspaceId}/members`, { email: bob.email })).status).toBe(409)
    })

    it('üye kişi başkasını ekleyemez (403)', async () => {
      const res = await as(bob.token).post(`/api/workspaces/${workspaceId}/members`, { email: carol.email })
      expect(res.status).toBe(403)
    })

    it('üye alanı ve üye listesini görür', async () => {
      const res = await as(bob.token).get(`/api/workspaces/${workspaceId}`)
      expect(res.status).toBe(200)
      expect(res.body.members.map((m) => m.email).sort()).toEqual([alice.email, bob.email])
    })

    it('sahibin rolü değiştirilemez ve sahip çıkarılamaz', async () => {
      expect((await as(alice.token).patch(`/api/workspaces/${workspaceId}/members/${alice.id}`, { role: 'member' })).status).toBe(400)
      expect((await as(alice.token).delete(`/api/workspaces/${workspaceId}/members/${alice.id}`)).status).toBe(400)
    })
  })

  describe('proje', () => {
    it('üye proje oluşturabilir', async () => {
      const res = await as(bob.token).post(`/api/workspaces/${workspaceId}/projects`, { name: 'Web Sitesi', description: 'Yeni arayüz' })
      expect(res.status).toBe(201)
      projectId = res.body.project.id
    })

    it('dışarıdaki kişi proje oluşturamaz, göremez, değiştiremez', async () => {
      expect((await as(carol.token).post(`/api/workspaces/${workspaceId}/projects`, { name: 'Sızma' })).status).toBe(404)
      expect((await as(carol.token).get(`/api/workspaces/${workspaceId}/projects`)).status).toBe(404)
      expect((await as(carol.token).get(`/api/projects/${projectId}`)).status).toBe(404)
      expect((await as(carol.token).patch(`/api/projects/${projectId}`, { name: 'Ele geçirildi' })).status).toBe(404)
    })

    it('üye projeyi günceller ama silemez; yönetici siler', async () => {
      const patched = await as(bob.token).patch(`/api/projects/${projectId}`, { name: 'Web Sitesi v2' })
      expect(patched.body.project).toMatchObject({ name: 'Web Sitesi v2', description: 'Yeni arayüz' })
      expect((await as(bob.token).patch(`/api/projects/${projectId}`, {})).status).toBe(400)
      expect((await as(bob.token).delete(`/api/projects/${projectId}`)).status).toBe(403)

      const extra = await as(alice.token).post(`/api/workspaces/${workspaceId}/projects`, { name: 'Geçici' })
      expect((await as(alice.token).delete(`/api/projects/${extra.body.project.id}`)).status).toBe(204)
    })
  })

  describe('görev', () => {
    let taskId

    it('üye görev oluşturur ve alan üyesine atar', async () => {
      const res = await as(bob.token).post(`/api/projects/${projectId}/tasks`, {
        title: 'Giriş sayfasını tasarla',
        priority: 'high',
        assigneeId: alice.id,
        dueDate: '2026-12-31',
      })
      expect(res.status).toBe(201)
      expect(res.body.task).toMatchObject({ status: 'todo', priority: 'high', assigneeId: alice.id, dueDate: '2026-12-31' })
      taskId = res.body.task.id
    })

    it('alan dışındaki kişiye atama ve geçersiz veriler reddedilir', async () => {
      const base = `/api/projects/${projectId}/tasks`
      expect((await as(bob.token).post(base, { title: 'x', assigneeId: carol.id })).status).toBe(400)
      expect((await as(bob.token).post(base, { title: '' })).status).toBe(400)
      expect((await as(bob.token).post(base, { title: 'x', dueDate: '2026-02-31' })).status).toBe(400)
      expect((await as(bob.token).post(base, { title: 'x', priority: 'acil' })).status).toBe(400)
    })

    it('dışarıdaki kişi görev listeleyemez, okuyamaz, güncelleyemez, silemez', async () => {
      expect((await as(carol.token).get(`/api/projects/${projectId}/tasks`)).status).toBe(404)
      expect((await as(carol.token).post(`/api/projects/${projectId}/tasks`, { title: 'Sızma' })).status).toBe(404)
      expect((await as(carol.token).get(`/api/tasks/${taskId}`)).status).toBe(404)
      expect((await as(carol.token).patch(`/api/tasks/${taskId}`, { status: 'done' })).status).toBe(404)
      expect((await as(carol.token).delete(`/api/tasks/${taskId}`)).status).toBe(404)
    })

    it('durum güncellenir; boş güncelleme ve geçersiz durum reddedilir', async () => {
      const res = await as(alice.token).patch(`/api/tasks/${taskId}`, { status: 'in_progress' })
      expect(res.body.task.status).toBe('in_progress')
      expect((await as(alice.token).patch(`/api/tasks/${taskId}`, {})).status).toBe(400)
      expect((await as(alice.token).patch(`/api/tasks/${taskId}`, { status: 'bitti' })).status).toBe(400)
      const cleared = await as(alice.token).patch(`/api/tasks/${taskId}`, { assigneeId: null, dueDate: null })
      expect(cleared.body.task).toMatchObject({ assigneeId: null, dueDate: null })
    })

    it('filtreleme, arama ve sayfalama çalışır', async () => {
      const base = `/api/projects/${projectId}/tasks`
      for (const title of ['Rapor hazırla', 'Rapor gözden geçir', '100% test']) {
        await as(bob.token).post(base, { title, status: title.startsWith('Rapor') ? 'done' : 'todo' })
      }
      const done = await as(bob.token).get(`${base}?status=done`)
      expect(done.body.total).toBe(2)

      const search = await as(bob.token).get(`${base}?q=rapor`)
      expect(search.body.tasks.map((t) => t.title).sort()).toEqual(['Rapor gözden geçir', 'Rapor hazırla'])

      // % karakteri joker olarak yorumlanmamalı
      const literal = await as(bob.token).get(`${base}?q=${encodeURIComponent('100%')}`)
      expect(literal.body.total).toBe(1)

      const page = await as(bob.token).get(`${base}?limit=2&offset=0`)
      expect(page.body.tasks).toHaveLength(2)
      expect(page.body.total).toBe(4)
      expect((await as(bob.token).get(`${base}?limit=1000`)).status).toBe(400)
    })

    it('silme: üye başkasının görevini silemez, oluşturan ve yönetici silebilir', async () => {
      const base = `/api/projects/${projectId}/tasks`
      const byAlice = (await as(alice.token).post(base, { title: 'Alice görevi' })).body.task.id
      const byBob = (await as(bob.token).post(base, { title: 'Bob görevi' })).body.task.id
      const byBob2 = (await as(bob.token).post(base, { title: 'Bob görevi 2' })).body.task.id

      expect((await as(bob.token).delete(`/api/tasks/${byAlice}`)).status).toBe(403)
      expect((await as(bob.token).delete(`/api/tasks/${byBob}`)).status).toBe(204)
      expect((await as(alice.token).delete(`/api/tasks/${byBob2}`)).status).toBe(204)
      expect((await as(alice.token).delete(`/api/tasks/${byAlice}`)).status).toBe(204)
    })

    it('yorumlar: üye yazar ve okur, dışarıdaki kişi erişemez', async () => {
      const posted = await as(bob.token).post(`/api/tasks/${taskId}/comments`, { body: 'Taslak hazır' })
      expect(posted.status).toBe(201)
      expect((await as(bob.token).post(`/api/tasks/${taskId}/comments`, { body: '  ' })).status).toBe(400)

      const list = await as(alice.token).get(`/api/tasks/${taskId}/comments`)
      expect(list.body.comments).toMatchObject([{ body: 'Taslak hazır', authorName: 'bob' }])
      expect((await as(carol.token).get(`/api/tasks/${taskId}/comments`)).status).toBe(404)
      expect((await as(carol.token).post(`/api/tasks/${taskId}/comments`, { body: 'Sızma' })).status).toBe(404)
    })
  })

  describe('üye çıkarma ve etkinlik geçmişi', () => {
    it('çıkarılan üyenin görevleri atanmamış olur ve erişimi kapanır', async () => {
      const task = await as(alice.token).post(`/api/projects/${projectId}/tasks`, { title: 'Bob yapacak', assigneeId: bob.id })
      expect(task.status).toBe(201)

      expect((await as(alice.token).delete(`/api/workspaces/${workspaceId}/members/${bob.id}`)).status).toBe(204)

      const after = await as(alice.token).get(`/api/tasks/${task.body.task.id}`)
      expect(after.body.task.assigneeId).toBeNull()
      expect((await as(bob.token).get(`/api/workspaces/${workspaceId}`)).status).toBe(404)
      expect((await as(bob.token).get(`/api/projects/${projectId}`)).status).toBe(404)
    })

    it('etkinlik geçmişi olayları yeniden eskiye listeler', async () => {
      const res = await as(alice.token).get(`/api/workspaces/${workspaceId}/activity`)
      expect(res.status).toBe(200)
      const actions = res.body.activity.map((a) => a.action)
      expect(actions[0]).toBe('member.removed')
      expect(actions).toEqual(expect.arrayContaining(['workspace.created', 'member.added', 'project.created', 'task.created', 'task.deleted']))
      expect((await as(carol.token).get(`/api/workspaces/${workspaceId}/activity`)).status).toBe(404)
    })
  })
})
