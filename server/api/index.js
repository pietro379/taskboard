// Vercel giriş noktası: Express uygulaması sunucusuz fonksiyon olarak çalışır.
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { createUserRepo } from '../src/repos/users.js'

export default createApp({ users: createUserRepo(pool), db: pool })
