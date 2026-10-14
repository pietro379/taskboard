import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { HttpError } from '../middleware/error.js'
import { getMembership, parseId, projectContext, taskContext } from '../middleware/access.js'
import { logActivity } from '../lib/activity.js'

const idString = z.string().regex(/^\d{1,18}$/, 'Geçersiz kimlik')
const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı')
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Geçersiz tarih')

const statusEnum = z.enum(['todo', 'in_progress', 'done'])
const priorityEnum = z.enum(['low', 'medium', 'high'])

const createSchema = z.object({
  title: z.string().trim().min(1, 'Başlık boş olamaz').max(200),
  description: z.string().trim().max(5000).default(''),
  status: statusEnum.default('todo'),
  priority: priorityEnum.default('medium'),
  assigneeId: idString.nullable().optional(),
  dueDate: dueDate.nullable().optional(),
})

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    status: statusEnum,
    priority: priorityEnum,
    assigneeId: idString.nullable(),
    dueDate: dueDate.nullable(),
    position: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Güncellenecek alan gönderin')

const listSchema = z.object({
  status: statusEnum.optional(),
  assigneeId: idString.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const commentSchema = z.object({ body: z.string().trim().min(1, 'Yorum boş olamaz').max(2000) })

// Güncellenebilir alanların veritabanı sütunlarıyla eşleşmesi (yalnızca bu liste SQL'e girer).
const columns = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  assigneeId: 'assignee_id',
  dueDate: 'due_date',
  position: 'position',
}

const toTask = (row) => ({
  id: String(row.id),
  projectId: String(row.project_id),
  title: row.title,
  description: row.description,
  status: row.status,
  priority: row.priority,
  assigneeId: row.assignee_id === null ? null : String(row.assignee_id),
  dueDate: row.due_date,
  position: row.position,
  createdBy: String(row.created_by),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&')

export function tasksRouter({ db }) {
  const router = Router()

  // Atanan kişi aynı çalışma alanının üyesi olmalıdır.
  async function assertAssignee(workspaceId, assigneeId) {
    if (assigneeId == null) return
    if (!(await getMembership(db, workspaceId, assigneeId))) {
      throw new HttpError(400, 'Atanan kişi bu çalışma alanının üyesi değil')
    }
  }

  router.post('/projects/:id/tasks', requireAuth, async (req, res) => {
    const project = await projectContext(db, parseId(req.params.id), req.userId)
    const input = createSchema.parse(req.body)
    await assertAssignee(project.workspace_id, input.assigneeId)
    const { rows } = await db.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, due_date, position, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
         (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = $1 AND status = $4), $8)
       RETURNING *`,
      [project.id, input.title, input.description, input.status, input.priority, input.assigneeId ?? null, input.dueDate ?? null, req.userId],
    )
    await logActivity(db, { workspaceId: project.workspace_id, actorId: req.userId, action: 'task.created', entityType: 'task', entityId: rows[0].id })
    res.status(201).json({ task: toTask(rows[0]) })
  })

  router.get('/projects/:id/tasks', requireAuth, async (req, res) => {
    const project = await projectContext(db, parseId(req.params.id), req.userId)
    const filters = listSchema.parse(req.query)

    const conditions = ['project_id = $1']
    const params = [project.id]
    const add = (sql, value) => {
      params.push(value)
      conditions.push(sql.replace('?', `$${params.length}`))
    }
    if (filters.status) add('status = ?', filters.status)
    if (filters.assigneeId) add('assignee_id = ?', filters.assigneeId)
    if (filters.q) add("title ILIKE ? ESCAPE '\\'", `%${escapeLike(filters.q)}%`)
    const where = conditions.join(' AND ')

    const total = await db.query(`SELECT count(*)::int AS total FROM tasks WHERE ${where}`, params)
    const { rows } = await db.query(
      `SELECT * FROM tasks WHERE ${where} ORDER BY position, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    )
    res.json({ tasks: rows.map(toTask), total: total.rows[0].total, limit: filters.limit, offset: filters.offset })
  })

  router.get('/tasks/:id', requireAuth, async (req, res) => {
    res.json({ task: toTask(await taskContext(db, parseId(req.params.id), req.userId)) })
  })

  router.patch('/tasks/:id', requireAuth, async (req, res) => {
    const task = await taskContext(db, parseId(req.params.id), req.userId)
    const changes = updateSchema.parse(req.body)
    if ('assigneeId' in changes) await assertAssignee(task.workspace_id, changes.assigneeId)

    const entries = Object.entries(changes)
    const sets = entries.map(([key], i) => `${columns[key]} = $${i + 2}`)
    const { rows } = await db.query(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      [task.id, ...entries.map(([, value]) => value)],
    )
    const action = changes.status && changes.status !== task.status ? 'task.status_changed' : 'task.updated'
    await logActivity(db, { workspaceId: task.workspace_id, actorId: req.userId, action, entityType: 'task', entityId: task.id })
    res.json({ task: toTask(rows[0]) })
  })

  // Görevi yöneticiler veya görevi oluşturan kişi silebilir.
  router.delete('/tasks/:id', requireAuth, async (req, res) => {
    const task = await taskContext(db, parseId(req.params.id), req.userId)
    if (task.role !== 'admin' && String(task.created_by) !== String(req.userId)) {
      throw new HttpError(403, 'Bu görevi yalnızca yönetici veya oluşturan kişi silebilir')
    }
    await db.query('DELETE FROM tasks WHERE id = $1', [task.id])
    await logActivity(db, { workspaceId: task.workspace_id, actorId: req.userId, action: 'task.deleted', entityType: 'task', entityId: task.id })
    res.status(204).end()
  })

  router.post('/tasks/:id/comments', requireAuth, async (req, res) => {
    const task = await taskContext(db, parseId(req.params.id), req.userId)
    const { body } = commentSchema.parse(req.body)
    const { rows } = await db.query(
      'INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at',
      [task.id, req.userId, body],
    )
    res.status(201).json({ comment: { id: String(rows[0].id), body: rows[0].body, authorId: String(req.userId), createdAt: rows[0].created_at } })
  })

  router.get('/tasks/:id/comments', requireAuth, async (req, res) => {
    const task = await taskContext(db, parseId(req.params.id), req.userId)
    const { rows } = await db.query(
      `SELECT c.id, c.body, c.author_id, c.created_at, u.name AS author_name
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.task_id = $1 ORDER BY c.created_at, c.id`,
      [task.id],
    )
    res.json({
      comments: rows.map((r) => ({ id: String(r.id), body: r.body, authorId: String(r.author_id), authorName: r.author_name, createdAt: r.created_at })),
    })
  })

  return router
}
