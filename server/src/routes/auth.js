import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { HttpError } from '../middleware/error.js'
import { requireAuth, signToken } from '../middleware/auth.js'

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(80),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(128),
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

const publicUser = ({ id, email, name }) => ({ id: String(id), email, name })

export function authRouter({ users }) {
  const router = Router()

  router.post('/register', async (req, res) => {
    const { email, name, password } = registerSchema.parse(req.body)
    if (await users.findByEmail(email)) throw new HttpError(409, 'Bu e-posta zaten kayıtlı')
    const user = await users.create({ email, name, passwordHash: await bcrypt.hash(password, 10) })
    res.status(201).json({ user: publicUser(user), token: signToken(user) })
  })

  router.post('/login', async (req, res) => {
    const { email, password } = loginSchema.parse(req.body)
    const user = await users.findByEmail(email)
    // Hangi alanın yanlış olduğunu belli etmemek için tek mesaj kullanılır.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'E-posta veya şifre hatalı')
    }
    res.json({ user: publicUser(user), token: signToken(user) })
  })

  router.get('/me', requireAuth, async (req, res) => {
    const user = await users.findById(req.userId)
    if (!user) throw new HttpError(401, 'Kullanıcı bulunamadı')
    res.json({ user: publicUser(user) })
  })

  return router
}
