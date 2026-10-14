import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

// Bellekte çalışan sahte kullanıcı deposu: testler veritabanına ihtiyaç duymaz.
function fakeUserRepo() {
  const rows = []
  return {
    async findByEmail(email) {
      return rows.find((u) => u.email === email) ?? null
    },
    async findById(id) {
      return rows.find((u) => String(u.id) === String(id)) ?? null
    },
    async create({ email, name, passwordHash }) {
      const user = { id: rows.length + 1, email, name, password_hash: passwordHash }
      rows.push(user)
      return user
    },
  }
}

const valid = { email: 'ada@example.com', name: 'Ada Lovelace', password: 'sifre12345' }
let app

beforeEach(() => {
  app = createApp({ users: fakeUserRepo() })
})

describe('POST /api/auth/register', () => {
  it('yeni kullanıcı oluşturur ve token döner', async () => {
    const res = await request(app).post('/api/auth/register').send(valid)
    expect(res.status).toBe(201)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toEqual({ id: '1', email: valid.email, name: valid.name })
  })

  it('e-postayı küçük harfe çevirir', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...valid, email: 'ADA@Example.com' })
    expect(res.body.user.email).toBe('ada@example.com')
  })

  it('aynı e-posta ile ikinci kayda izin vermez', async () => {
    await request(app).post('/api/auth/register').send(valid)
    const res = await request(app).post('/api/auth/register').send(valid)
    expect(res.status).toBe(409)
  })

  it('kısa şifreyi ve geçersiz e-postayı reddeder', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...valid, email: 'x', password: '123' })
    expect(res.status).toBe(400)
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['email', 'password'])
  })

  it('bozuk JSON için 400 döner', async () => {
    const res = await request(app).post('/api/auth/register').set('Content-Type', 'application/json').send('{bozuk')
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => request(app).post('/api/auth/register').send(valid))

  it('doğru bilgilerle token döner', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: valid.email, password: valid.password })
    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
  })

  it('yanlış şifre ve bilinmeyen e-posta için aynı mesajı verir', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email: valid.email, password: 'yanlis-sifre' })
    const unknown = await request(app).post('/api/auth/login').send({ email: 'yok@example.com', password: 'sifre12345' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body.error).toBe(unknown.body.error)
  })
})

describe('GET /api/auth/me', () => {
  it('token olmadan 401 döner', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
  })

  it('geçersiz token için 401 döner', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer sahte.token.degeri')
    expect(res.status).toBe(401)
  })

  it('geçerli token ile kullanıcıyı döner', async () => {
    const { body } = await request(app).post('/api/auth/register').send(valid)
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(valid.email)
  })
})

describe('genel', () => {
  it('/health çalışır, bilinmeyen yol 404 döner', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' })
    expect((await request(app).get('/api/yok')).status).toBe(404)
  })
})
