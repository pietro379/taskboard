import pg from 'pg'
import { config } from './config.js'

// DATE sütunları Date nesnesi yerine 'YYYY-MM-DD' metni olarak döner (saat dilimi kaymasını önler).
pg.types.setTypeParser(1082, (value) => value)

// Neon gibi bulut veritabanları SSL ister; bağlantı adresindeki sslmode bunu belirler.
export function createPool(connectionString, options = {}) {
  return new pg.Pool({ connectionString, max: 10, ...options })
}

export const pool = createPool(config.databaseUrl ?? undefined)

export const query = (text, params) => pool.query(text, params)
