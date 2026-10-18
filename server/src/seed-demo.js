import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { logActivity } from './lib/activity.js'

// Canlı demo için örnek veri: bir demo kullanıcısı, iki takım arkadaşı, bir çalışma alanı,
// iki proje, etiketler, görevler, yorumlar ve etkinlik geçmişi.
// Betik yeniden çalıştırılabilir: yalnızca @taskboard.example adreslerini siler (çalışma alanı
// sahibi silinince ilişkili her şey zincirleme silinir), gerçek kullanıcılara dokunmaz.

export const DEMO_EMAIL = 'demo@taskboard.example'
// Herkese açık, yalnızca bu örnek verinin şifresi; README'de de yazar.
export const DEMO_PASSWORD = 'demo-taskboard-2026'

const DEMO_DOMAIN = '@taskboard.example'

const LABELS = [
  ['Hata', 'red'],
  ['Özellik', 'violet'],
  ['Acil', 'amber'],
  ['Tasarım', 'sky'],
  ['Dokümantasyon', 'slate'],
]

// [başlık, durum, öncelik, atanan, bitiş (gün farkı), etiketler]
const PROJECTS = [
  {
    name: 'Web Sitesi Yenileme',
    description: 'Kurumsal sitenin yeni tasarımı ve hesap özellikleri.',
    tasks: [
      ['Giriş formunu düzelt', 'todo', 'high', 'elif', 2, ['Hata', 'Acil']],
      ['Profil sayfasını ekle', 'todo', 'medium', 'mert', 9, ['Özellik']],
      ['Raporları dışa aktar', 'todo', 'medium', null, null, ['Özellik']],
      ['Şifre sıfırlama e-postası', 'todo', 'medium', null, null, ['Hata']],
      ['Karanlık tema', 'in_progress', 'medium', 'demo', 6, ['Özellik', 'Tasarım']],
      ['Ana sayfa yeniden tasarımı', 'in_progress', 'high', 'elif', 4, ['Tasarım']],
      ['Proje iskeleti ve CI', 'done', 'medium', 'demo', null, []],
      ['Kullanıcı kaydı ve giriş', 'done', 'high', 'mert', null, ['Özellik']],
      ['API dokümantasyonu', 'done', 'low', 'demo', null, ['Dokümantasyon']],
    ],
  },
  {
    name: 'Mobil Uygulama',
    description: 'iOS ve Android istemcisi için ilk sürüm planı.',
    tasks: [
      ['Anlık bildirimler', 'todo', 'medium', null, null, ['Özellik']],
      ['Çevrimdışı mod', 'todo', 'high', 'mert', 14, ['Özellik']],
      ['Tablet yerleşimi', 'in_progress', 'low', 'elif', 8, ['Tasarım']],
      ['Uygulama ikonu', 'done', 'low', 'demo', null, ['Tasarım']],
    ],
  },
]

// [görev başlığı, yazar, metin]
const COMMENTS = [
  ['Giriş formunu düzelt', 'elif', 'Safari’de gönder düğmesi iki kez tetikleniyor, bakıyorum.'],
  ['Giriş formunu düzelt', 'demo', 'Teşekkürler, sürüm öncesi bitirebilirsek harika olur.'],
  ['Karanlık tema', 'mert', 'Renk paletini tasarım dosyasıyla eşleştirdim, gözden geçirir misin?'],
  ['Çevrimdışı mod', 'demo', 'Önce hangi ekranların çevrimdışı çalışacağını belirleyelim.'],
]

function dateInDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

// db: pg.Pool veya pg.Client. Tüm işlem tek bir transaction'da yapılır.
export async function seedDemo(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM users WHERE email LIKE $1', [`%${DEMO_DOMAIN}`])

    const createUser = async (key, name, password) => {
      const { rows } = await client.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [`${key}${DEMO_DOMAIN}`, name, await bcrypt.hash(password, 10)],
      )
      return rows[0].id
    }
    // Takım arkadaşlarının giriş şifresi rastgele ve saklanmaz: yalnızca demo kullanıcısı giriş yapar.
    const users = {
      demo: await createUser('demo', 'Demo Kullanıcı', DEMO_PASSWORD),
      elif: await createUser('elif', 'Elif Kaya', randomBytes(24).toString('hex')),
      mert: await createUser('mert', 'Mert Aydın', randomBytes(24).toString('hex')),
    }

    const { rows: [workspace] } = await client.query(
      'INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id',
      ['Ürün Takımı', users.demo],
    )
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [workspace.id, users.demo, users.elif, users.mert],
    )
    const log = (actor, action, entityType, entityId) =>
      logActivity(client, { workspaceId: workspace.id, actorId: users[actor], action, entityType, entityId })
    await log('demo', 'workspace.created', 'workspace', workspace.id)
    await log('demo', 'member.added', 'user', users.elif)
    await log('demo', 'member.added', 'user', users.mert)

    const labelIds = {}
    for (const [name, color] of LABELS) {
      const { rows } = await client.query(
        'INSERT INTO labels (workspace_id, name, color) VALUES ($1, $2, $3) RETURNING id',
        [workspace.id, name, color],
      )
      labelIds[name] = rows[0].id
    }

    const taskIds = {}
    for (const project of PROJECTS) {
      const { rows: [created] } = await client.query(
        'INSERT INTO projects (workspace_id, name, description) VALUES ($1, $2, $3) RETURNING id',
        [workspace.id, project.name, project.description],
      )
      await log('demo', 'project.created', 'project', created.id)

      const nextPosition = {}
      for (const [title, status, priority, assignee, dueIn, labels] of project.tasks) {
        const position = (nextPosition[status] = (nextPosition[status] ?? -1) + 1)
        const { rows } = await client.query(
          `INSERT INTO tasks (project_id, title, status, priority, assignee_id, due_date, position, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [created.id, title, status, priority, assignee ? users[assignee] : null, dueIn == null ? null : dateInDays(dueIn), position, users.demo],
        )
        taskIds[title] = rows[0].id
        for (const label of labels) {
          await client.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)', [rows[0].id, labelIds[label]])
        }
        await log(assignee ?? 'demo', 'task.created', 'task', rows[0].id)
      }
    }

    for (const [title, author, body] of COMMENTS) {
      await client.query('INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3)', [taskIds[title], users[author], body])
    }

    await client.query('COMMIT')
    return { workspaceId: workspace.id, users, tasks: Object.keys(taskIds).length }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// `npm run seed:demo` ile çalıştırıldığında DATABASE_URL'deki veritabanına yazar.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pool } = await import('./db.js')
  try {
    const result = await seedDemo(pool)
    console.log(`Demo verisi hazır: ${result.tasks} görev, çalışma alanı #${result.workspaceId}`)
    console.log(`Giriş: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
  } catch (err) {
    console.error(err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
