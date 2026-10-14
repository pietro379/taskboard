import { HttpError } from './error.js'
import { LABEL_IDS_SQL } from '../lib/tasks.js'

// URL'deki kimlikleri doğrular; geçersizse kaynak yokmuş gibi 404 döner.
export function parseId(value) {
  if (!/^\d{1,18}$/.test(String(value))) throw new HttpError(404, 'Kaynak bulunamadı')
  return String(value)
}

export async function getMembership(db, workspaceId, userId) {
  const { rows } = await db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  )
  return rows[0] ?? null
}

// Üye olmayanlara kaynağın var olup olmadığı bile söylenmez (403 yerine 404).
export async function requireMember(db, workspaceId, userId) {
  const membership = await getMembership(db, workspaceId, userId)
  if (!membership) throw new HttpError(404, 'Çalışma alanı bulunamadı')
  return membership
}

export function assertAdmin(role) {
  if (role !== 'admin') throw new HttpError(403, 'Bu işlem için yönetici olmanız gerekiyor')
}

export async function requireAdmin(db, workspaceId, userId) {
  const membership = await requireMember(db, workspaceId, userId)
  assertAdmin(membership.role)
  return membership
}

// Projeyi, isteği yapan kullanıcının o çalışma alanındaki rolüyle birlikte getirir.
export async function projectContext(db, projectId, userId) {
  const { rows } = await db.query(
    `SELECT p.*, m.role FROM projects p
     JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = $2
     WHERE p.id = $1`,
    [projectId, userId],
  )
  if (!rows[0]) throw new HttpError(404, 'Proje bulunamadı')
  return rows[0]
}

export async function taskContext(db, taskId, userId) {
  const { rows } = await db.query(
    `SELECT t.*, ${LABEL_IDS_SQL}, p.workspace_id, m.role FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = $2
     WHERE t.id = $1`,
    [taskId, userId],
  )
  if (!rows[0]) throw new HttpError(404, 'Görev bulunamadı')
  return rows[0]
}
