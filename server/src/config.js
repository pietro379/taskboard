// Ortam değişkenlerini tek yerden okur ve eksikse erken hata verir.
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'

function required(name, fallback) {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`${name} ortam değişkeni tanımlı değil`)
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? null,
  jwtSecret: required('JWT_SECRET', isTest ? 'test-secret-test-secret-test-secret' : undefined),
  jwtExpiresIn: '7d',
}
