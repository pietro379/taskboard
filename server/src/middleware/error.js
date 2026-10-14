import { ZodError } from 'zod'

// Beklenen hatalar için kullanılır: new HttpError(409, 'Bu e-posta zaten kayıtlı')
export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Kaynak bulunamadı' })
}

// Tüm hatalar tek biçimde döner; beklenmeyen hataların ayrıntısı istemciye sızdırılmaz.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Geçersiz istek',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz JSON' })
  console.error(err)
  res.status(500).json({ error: 'Sunucu hatası' })
}
