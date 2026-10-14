import { defineConfig } from 'vitest/config'

// Yerelde .env dosyasındaki DATABASE_URL okunur; CI'da değişken doğrudan verilir.
try {
  process.loadEnvFile('.env')
} catch {
  // .env yoksa veritabanı gerektiren testler atlanır
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
