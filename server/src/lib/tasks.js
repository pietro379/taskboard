import { HttpError } from '../middleware/error.js'

// Görev satırına etiket kimliklerini JSON dizisi olarak ekleyen SQL parçası (tablo takma adı: t).
export const LABEL_IDS_SQL = `COALESCE((SELECT json_agg(tl.label_id::text ORDER BY tl.label_id) FROM task_labels tl WHERE tl.task_id = t.id), '[]'::json) AS label_ids`

export const TASK_SELECT = `SELECT t.*, ${LABEL_IDS_SQL} FROM tasks t`

export async function loadTask(db, taskId) {
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $1`, [taskId])
  return rows[0] ?? null
}

// Gönderilen etiketlerin hepsi görevin çalışma alanına ait olmalıdır.
export async function assertLabelsInWorkspace(db, workspaceId, labelIds) {
  if (!labelIds || labelIds.length === 0) return
  const { rows } = await db.query('SELECT id FROM labels WHERE workspace_id = $1 AND id = ANY($2::bigint[])', [workspaceId, labelIds])
  if (rows.length !== new Set(labelIds).size) throw new HttpError(400, 'Etiketlerden biri bu çalışma alanına ait değil')
}

// Görevin etiketlerini verilen listeyle değiştirir.
export async function setTaskLabels(db, taskId, labelIds) {
  await db.query('DELETE FROM task_labels WHERE task_id = $1', [taskId])
  if (labelIds.length > 0) {
    await db.query('INSERT INTO task_labels (task_id, label_id) SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING', [taskId, labelIds])
  }
}
