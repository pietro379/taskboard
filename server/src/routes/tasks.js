import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { HttpError } from '../middleware/error.js'
import { getMembership, parseId, projectContext, taskContext } from '../middleware/access.js'
import { logActivity } from '../lib/activity.js'
import { withTransaction } from '../lib/tx.js'
import { assertLabelsInWorkspace, loadTask, setTaskLabels, TASK_SELECT } from '../lib/tasks.js'

const idString = z.string().regex(/^\d{1,18}$/, 'Geçersiz kimlik')
const labelIds = z.array(idString).max(10, 'Bir göreve en fazla 10 etiket eklenebilir')
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
  labelIds: labelIds.default([]),
})

// Güncelleme şemasında varsayılan değer olmaz; aksi halde gönderilmeyen alanlar sıfırlanırdı.
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    status: statusEnum,
    priority: priorityEnum,
    assigneeId: idString.nullable(),
    dueDate: dueDate.nullable(),
    position: z.number().int().min(0),
    labelIds,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Güncellenecek alan gönderin')

const moveSchema = z.object({ status: statusEnum, index: z.number().int().min(0) })

const listSchema = z.object({
  status: statusEnum.optional(),
  assigneeId: idString.optional(),
  labelId: idString.optional(),
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
  labelIds: row.label_ids,
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
    await assertLabelsInWorkspace(db, project.workspace_id, input.labelIds)

    const taskId = await withTransaction(db, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, due_date, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
           (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = $1 AND status = $4), $8)
         RETURNING id`,
        [project.id, input.title, input.description, input.status, input.priority, input.assigneeId ?? null, input.dueDate ?? null, req.userId],
      )
      await setTaskLabels(tx, rows[0].id, input.labelIds)
      return rows[0].id
    })
    await logActivity(db, { workspaceId: project.workspace_id, actorId: req.userId, action: 'task.created', entityType: 'task', entityId: taskId })
    res.status(201).json({ task: toTask(await loadTask(db, taskId)) })
  })

  router.get('/projects/:id/tasks', requireAuth, async (req, res) => {
    const project = await projectContext(db, parseId(req.params.id), req.userId)
    const filters = listSchema.parse(req.query)

    const conditions = ['t.project_id = $1']
    const params = [project.id]
    const add = (sql, value) => {
      params.push(value)
      conditions.push(sql.replace('?', `$${params.length}`))
    }
    if (filters.status) add('t.status = ?', filters.status)
    if (filters.assigneeId) add('t.assignee_id = ?', filters.assigneeId)
    if (filters.labelId) add('EXISTS (SELECT 1 FROM task_labels f WHERE f.task_id = t.id AND f.label_id = ?)', filters.labelId)
    if (filters.q) add("t.title ILIKE ? ESCAPE '\\'", `%${escapeLike(filters.q)}%`)
    const where = conditions.join(' AND ')

    const total = await db.query(`SELECT count(*)::int AS total FROM tasks t WHERE ${where}`, params)
    const { rows } = await db.query(
      `${TASK_SELECT} WHERE ${where} ORDER BY t.position, t.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    )
    res.json({ tasks: rows.map(toTask), total: total.rows[0].total, limit: filters.limit, offset: filters.offset })
  })

  router.get('/tasks/:id', requireAuth, async (req, res) => {
    res.json({ task: toTask(await taskContext(db, parseId(req.params.id), req.userId)) })
  })

  router.patch('/tasks/:id', requireAuth, async (req, res) => {
    const task = await taskContext(db, parseId(req.params.id), req.userId)
    const { labelIds: newLabelIds, ...changes } = updateSchema.parse(req.body)
    if ('assigneeId' in changes) await assertAssignee(task.workspace_id, changes.assigneeId)
    if (newLabelIds) await assertLabelsInWorkspace(db, task.workspace_id, newLabelIds)

    const entries = Object.entries(changes)
    await withTransaction(db, async (tx) => {
      const sets = entries.map(([key], i) => `${columns[key]} = $${i + 2}`)
      await tx.query(`UPDATE tasks SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE id = $1`, [task.id, ...entries.map(([, value]) => value)])
      if (newLabelIds) await setTaskLabels(tx, task.id, newLabelIds)
    })

    const action = changes.status && changes.status !== task.status ? 'task.status_changed' : 'task.updated'
    await logActivity(db, { workspaceId: task.workspace_id, actorId: req.userId, action, entityType: 'task', entityId: task.id })
    res.json({ task: toTask(await loadTask(db, task.id)) })
  })

  // Görevi bir sütuna, belirli bir sıraya taşır; sütundaki konumlar yeniden numaralandırılır.
  // index, taşınan görev hariç sütun listesindeki ekleme sırasıdır (0 = en üst).
  router.post('/tasks/:id/move', requireAuth, async (req, res) => {
    const task = await taskContext(db, parseId(req.params.id), req.userId)
    const { status, index } = moveSchema.parse(req.body)

    await withTransaction(db, async (tx) => {
      // Aynı sütunda eşzamanlı taşımalar sıraya girsin diye satırlar kilitlenir.
      const { rows } = await tx.query(
        'SELECT id FROM tasks WHERE project_id = $1 AND status = $2 AND id <> $3 ORDER BY position, id FOR UPDATE',
        [task.project_id, status, task.id],
      )
      const ids = rows.map((r) => r.id)
      ids.splice(Math.min(index, ids.length), 0, task.id)
      await tx.query(
        `UPDATE tasks t SET position = v.pos, status = $3, updated_at = CASE WHEN t.id = $4 THEN now() ELSE t.updated_at END
         FROM unnest($1::bigint[], $2::int[]) AS v(id, pos) WHERE t.id = v.id`,
        [ids, ids.map((_, i) => i + 1), status, task.id],
      )
    })

    const action = status !== task.status ? 'task.status_changed' : 'task.reordered'
    await logActivity(db, { workspaceId: task.workspace_id, actorId: req.userId, action, entityType: 'task', entityId: task.id })
    const { rows } = await db.query(`${TASK_SELECT} WHERE t.project_id = $1 AND t.status = $2 ORDER BY t.position, t.id`, [task.project_id, status])
    res.json({ tasks: rows.map(toTask) })
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
