import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { HttpError } from '../middleware/error.js'
import { parseId, requireAdmin, requireMember } from '../middleware/access.js'
import { withTransaction } from '../lib/tx.js'
import { logActivity } from '../lib/activity.js'

const createSchema = z.object({ name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(80) })
const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
  role: z.enum(['admin', 'member']).default('member'),
})
const roleSchema = z.object({ role: z.enum(['admin', 'member']) })

const toWorkspace = (row) => ({
  id: String(row.id),
  name: row.name,
  ownerId: String(row.owner_id),
  createdAt: row.created_at,
  ...(row.role && { role: row.role }),
})

const toMember = (row) => ({ id: String(row.id), name: row.name, email: row.email, role: row.role })

export function workspacesRouter({ db }) {
  const router = Router()
  router.use(requireAuth)

  router.post('/', async (req, res) => {
    const { name } = createSchema.parse(req.body)
    const workspace = await withTransaction(db, async (tx) => {
      const { rows } = await tx.query('INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING *', [name, req.userId])
      const created = rows[0]
      await tx.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin')", [created.id, req.userId])
      await logActivity(tx, { workspaceId: created.id, actorId: req.userId, action: 'workspace.created', entityType: 'workspace', entityId: created.id })
      return created
    })
    res.status(201).json({ workspace: toWorkspace({ ...workspace, role: 'admin' }) })
  })

  router.get('/', async (req, res) => {
    const { rows } = await db.query(
      `SELECT w.*, m.role FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = $1 ORDER BY w.created_at DESC`,
      [req.userId],
    )
    res.json({ workspaces: rows.map(toWorkspace) })
  })

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id)
    const { role } = await requireMember(db, id, req.userId)
    const { rows } = await db.query('SELECT * FROM workspaces WHERE id = $1', [id])
    const members = await db.query(
      `SELECT u.id, u.name, u.email, m.role FROM workspace_members m
       JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 ORDER BY m.joined_at, u.id`,
      [id],
    )
    res.json({ workspace: toWorkspace({ ...rows[0], role }), members: members.rows.map(toMember) })
  })

  router.post('/:id/members', async (req, res) => {
    const id = parseId(req.params.id)
    await requireAdmin(db, id, req.userId)
    const { email, role } = addMemberSchema.parse(req.body)
    const { rows } = await db.query('SELECT id, name, email FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user) throw new HttpError(404, 'Bu e-posta ile kayıtlı kullanıcı bulunamadı')
    const result = await db.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, user.id, role],
    )
    if (!result.rowCount) throw new HttpError(409, 'Kullanıcı zaten bu çalışma alanının üyesi')
    await logActivity(db, { workspaceId: id, actorId: req.userId, action: 'member.added', entityType: 'user', entityId: user.id })
    res.status(201).json({ member: toMember({ ...user, role }) })
  })

  router.patch('/:id/members/:userId', async (req, res) => {
    const id = parseId(req.params.id)
    const userId = parseId(req.params.userId)
    await requireAdmin(db, id, req.userId)
    const { role } = roleSchema.parse(req.body)
    await assertNotOwner(db, id, userId)
    const result = await db.query('UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2', [id, userId, role])
    if (!result.rowCount) throw new HttpError(404, 'Üye bulunamadı')
    await logActivity(db, { workspaceId: id, actorId: req.userId, action: 'member.role_changed', entityType: 'user', entityId: userId })
    res.json({ member: { id: userId, role } })
  })

  router.delete('/:id/members/:userId', async (req, res) => {
    const id = parseId(req.params.id)
    const userId = parseId(req.params.userId)
    await requireAdmin(db, id, req.userId)
    await assertNotOwner(db, id, userId)
    await withTransaction(db, async (tx) => {
      const result = await tx.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [id, userId])
      if (!result.rowCount) throw new HttpError(404, 'Üye bulunamadı')
      // Çıkarılan üyenin görevleri atanmamış duruma döner.
      await tx.query(
        `UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $2
         AND project_id IN (SELECT id FROM projects WHERE workspace_id = $1)`,
        [id, userId],
      )
      await logActivity(tx, { workspaceId: id, actorId: req.userId, action: 'member.removed', entityType: 'user', entityId: userId })
    })
    res.status(204).end()
  })

  router.get('/:id/activity', async (req, res) => {
    const id = parseId(req.params.id)
    await requireMember(db, id, req.userId)
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.name AS actor_name
       FROM activity_log a JOIN users u ON u.id = a.actor_id
       WHERE a.workspace_id = $1 ORDER BY a.id DESC LIMIT 50`,
      [id],
    )
    res.json({
      activity: rows.map((r) => ({
        id: String(r.id),
        action: r.action,
        entityType: r.entity_type,
        entityId: String(r.entity_id),
        actorName: r.actor_name,
        createdAt: r.created_at,
      })),
    })
  })

  return router
}

// Çalışma alanının sahibi çıkarılamaz ve rolü değiştirilemez; böylece alan yöneticisiz kalmaz.
async function assertNotOwner(db, workspaceId, userId) {
  const { rows } = await db.query('SELECT owner_id FROM workspaces WHERE id = $1', [workspaceId])
  if (String(rows[0]?.owner_id) === String(userId)) {
    throw new HttpError(400, 'Çalışma alanı sahibi üzerinde bu işlem yapılamaz')
  }
}
