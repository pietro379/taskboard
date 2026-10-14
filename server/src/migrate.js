import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { pool } from './db.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

// Çalıştırılmış migration'ları kaydeder; her dosya yalnızca bir kez, tek işlemde uygulanır.
export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (done.has(file)) continue
    const sql = await readFile(path.join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`uygulandı: ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
