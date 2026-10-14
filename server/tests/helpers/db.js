import { randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createPool } from '../../src/db.js'

export const hasDb = Boolean(process.env.DATABASE_URL)

// Her test çalıştırması için geçici bir şema açar; gerçek verilere dokunulmaz, bitince şema silinir.
// search_path başlangıç parametresi Neon'un havuzlu (-pooler) bağlantısında desteklenmediği için
// testler doğrudan bağlantı adresini kullanır.
export async function setupTestDb() {
  const schema = `test_${randomBytes(6).toString('hex')}`
  const url = new URL(process.env.DATABASE_URL)
  url.hostname = url.hostname.replace('-pooler', '')

  const admin = createPool(url.toString(), { max: 1 })
  await admin.query(`CREATE SCHEMA ${schema}`)
  const pool = createPool(url.toString(), { options: `-c search_path=${schema}` })

  const dir = path.join(import.meta.dirname, '..', '..', 'migrations')
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(await readFile(path.join(dir, file), 'utf8'))
  }

  return {
    pool,
    async teardown() {
      await pool.end()
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    },
  }
}
