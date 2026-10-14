// Verilen işlevi tek bir veritabanı işlemi (transaction) içinde çalıştırır; hata olursa geri alır.
export async function withTransaction(db, fn) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
