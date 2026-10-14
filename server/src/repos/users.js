// Kullanıcı tablosuna erişim; veritabanı bağımlılığı dışarıdan verilir (test edilebilirlik için).
export function createUserRepo(db) {
  return {
    async findByEmail(email) {
      const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email])
      return rows[0] ?? null
    },
    async findById(id) {
      const { rows } = await db.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [id])
      return rows[0] ?? null
    },
    async create({ email, name, passwordHash }) {
      const { rows } = await db.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
        [email, name, passwordHash],
      )
      return rows[0]
    },
  }
}
