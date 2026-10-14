import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { assertAdmin, parseId, projectContext, requireMember } from '../middleware/access.js'
import { logActivity } from '../lib/activity.js'

const createSchema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(100),
  description: z.string().trim().max(1000).default(''),
})
// Güncelleme şemasında varsayılan değer olmaz; aksi halde gönderilmeyen alanlar sıfırlanırdı.
const updateSchema = z
  .object({
    name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(100),
    description: z.string().trim().max(1000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Güncellenecek alan gönderin')

const toProject = (row) => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  ...(row.task_count !== undefined && { taskCount: row.task_count }),
})

// Bu router /api altına bağlanır; kimlik doğrulama yalnızca kendi yollarında uygulanır.
export function projectsRouter({ db }) {
  const router = Router()

  router.post('/workspaces/:id/projects', requireAuth, async (req, res) => {
    const workspaceId = parseId(req.params.id)
    await requireMember(db, workspaceId, req.userId)
    const { name, description } = createSchema.parse(req.body)
    const { rows } = await db.query(
      'INSERT INTO projects (workspace_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [workspaceId, name, description],
    )
    await logActivity(db, { workspaceId, actorId: req.userId, action: 'project.created', entityType: 'project', entityId: rows[0].id })
    res.status(201).json({ project: toProject(rows[0]) })
  })

  router.get('/workspaces/:id/projects', requireAuth, async (req, res) => {
    const workspaceId = parseId(req.params.id)
    await requireMember(db, workspaceId, req.userId)
    const { rows } = await db.query(
      `SELECT p.*, count(t.id)::int AS task_count FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.workspace_id = $1 GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`,
      [workspaceId],
    )
    res.json({ projects: rows.map(toProject) })
  })

  router.get('/projects/:id', requireAuth, async (req, res) => {
    const project = await projectContext(db, parseId(req.params.id), req.userId)
    res.json({ project: toProject(project) })
  })

  router.patch('/projects/:id', requireAuth, async (req, res) => {
    const project = await projectContext(db, parseId(req.params.id), req.userId)
    const changes = updateSchema.parse(req.body)
    const { rows } = await db.query(
      'UPDATE projects SET name = $2, description = $3 WHERE id = $1 RETURNING *',
      [project.id, changes.name ?? project.name, changes.description ?? project.description],
    )
    res.json({ project: toProject(rows[0]) })
  })

  router.delete('/projects/:id', requireAuth, async (req, res) => {
    const project = await projectContext(db, parseId(req.params.id), req.userId)
    assertAdmin(project.role)
    await db.query('DELETE FROM projects WHERE id = $1', [project.id])
    await logActivity(db, { workspaceId: project.workspace_id, actorId: req.userId, action: 'project.deleted', entityType: 'project', entityId: project.id })
    res.status(204).end()
  })

  return router
}
