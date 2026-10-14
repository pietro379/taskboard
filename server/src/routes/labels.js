import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { HttpError } from '../middleware/error.js'
import { assertAdmin, parseId, requireMember } from '../middleware/access.js'

export const LABEL_COLORS = ['slate', 'red', 'amber', 'emerald', 'sky', 'indigo', 'violet', 'pink']

const createSchema = z.object({
  name: z.string().trim().min(1, 'Etiket adı boş olamaz').max(30),
  color: z.enum(LABEL_COLORS).default('indigo'),
})

const toLabel = (row) => ({ id: String(row.id), workspaceId: String(row.workspace_id), name: row.name, color: row.color })

export function labelsRouter({ db }) {
  const router = Router()

  router.get('/workspaces/:id/labels', requireAuth, async (req, res) => {
    const workspaceId = parseId(req.params.id)
    await requireMember(db, workspaceId, req.userId)
    const { rows } = await db.query('SELECT * FROM labels WHERE workspace_id = $1 ORDER BY name', [workspaceId])
    res.json({ labels: rows.map(toLabel) })
  })

  router.post('/workspaces/:id/labels', requireAuth, async (req, res) => {
    const workspaceId = parseId(req.params.id)
    await requireMember(db, workspaceId, req.userId)
    const { name, color } = createSchema.parse(req.body)
    const { rows } = await db.query(
      'INSERT INTO labels (workspace_id, name, color) VALUES ($1, $2, $3) ON CONFLICT (workspace_id, name) DO NOTHING RETURNING *',
      [workspaceId, name, color],
    )
    if (!rows[0]) throw new HttpError(409, 'Bu isimde bir etiket zaten var')
    res.status(201).json({ label: toLabel(rows[0]) })
  })

  // Etiket silinince görevlerden de kalkar (task_labels kaydı CASCADE ile silinir).
  router.delete('/labels/:id', requireAuth, async (req, res) => {
    const labelId = parseId(req.params.id)
    const { rows } = await db.query(
      `SELECT l.workspace_id, m.role FROM labels l
       JOIN workspace_members m ON m.workspace_id = l.workspace_id AND m.user_id = $2
       WHERE l.id = $1`,
      [labelId, req.userId],
    )
    if (!rows[0]) throw new HttpError(404, 'Etiket bulunamadı')
    assertAdmin(rows[0].role)
    await db.query('DELETE FROM labels WHERE id = $1', [labelId])
    res.status(204).end()
  })

  return router
}
