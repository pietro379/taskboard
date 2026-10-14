import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { HttpError } from './error.js'

export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
}

// Authorization: Bearer <token> başlığını doğrular ve req.userId alanını doldurur.
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next(new HttpError(401, 'Giriş yapmanız gerekiyor'))
  try {
    req.userId = jwt.verify(token, config.jwtSecret).sub
    next()
  } catch {
    next(new HttpError(401, 'Oturum geçersiz veya süresi dolmuş'))
  }
}
