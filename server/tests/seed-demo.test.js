import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createUserRepo } from '../src/repos/users.js'
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/seed-demo.js'
import { hasDb, setupTestDb } from './helpers/db.js'

describe.skipIf(!hasDb)('demo verisi', () => {
  let testDb
  let result

  beforeAll(async () => {
    testDb = await setupTestDb()
    result = await seedDemo(testDb.pool)
  })

  afterAll(() => testDb?.teardown())

  it('demo kullanıcısı örnek şifreyle giriş yapıp çalışma alanını görür', async () => {
    const app = createApp({ users: createUserRepo(testDb.pool), db: testDb.pool })
    const login = await request(app).post('/api/auth/login').send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    expect(login.status).toBe(200)

    const workspaces = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${login.body.token}`)
    expect(workspaces.body.workspaces.map((w) => w.name)).toEqual(['Ürün Takımı'])
  })

  it('her sütunda görev, etiket ve yorum içerir; sıra numaraları sütun başına 0\'dan başlar', async () => {
    const { rows: columns } = await testDb.pool.query(
      `SELECT status, count(*)::int AS count, min(position) AS first FROM tasks GROUP BY status`,
    )
    expect(columns.map((c) => c.status).sort()).toEqual(['done', 'in_progress', 'todo'])
    expect(columns.every((c) => c.count > 0)).toBe(true)

    const counts = await testDb.pool.query(
      `SELECT (SELECT count(*)::int FROM task_labels) AS labels, (SELECT count(*)::int FROM comments) AS comments`,
    )
    expect(counts.rows[0].labels).toBeGreaterThan(0)
    expect(counts.rows[0].comments).toBeGreaterThan(0)
    expect(result.tasks).toBe(13)
  })

  it('yeniden çalıştırılınca çoğalmaz ve gerçek kullanıcılara dokunmaz', async () => {
    await testDb.pool.query(`INSERT INTO users (email, name, password_hash) VALUES ('gercek@example.com', 'Gerçek', 'x')`)
    await seedDemo(testDb.pool)

    const { rows } = await testDb.pool.query('SELECT count(*)::int AS count FROM workspaces')
    expect(rows[0].count).toBe(1)
    const real = await testDb.pool.query(`SELECT 1 FROM users WHERE email = 'gercek@example.com'`)
    expect(real.rowCount).toBe(1)
  })
})
