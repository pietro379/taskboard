import { config } from './config.js'
import { createApp } from './app.js'
import { pool } from './db.js'
import { createUserRepo } from './repos/users.js'

if (!config.databaseUrl) throw new Error('DATABASE_URL ortam değişkeni tanımlı değil (.env dosyasına bakın)')

const app = createApp({ users: createUserRepo(pool), db: pool })
const server = app.listen(config.port, () => console.log(`API http://localhost:${config.port} adresinde çalışıyor`))

// Düzgün kapanış: açık bağlantılar bitince havuz kapatılır.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))))
}
