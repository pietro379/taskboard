// Çalışma alanındaki önemli olayları etkinlik geçmişine yazar.
export function logActivity(db, { workspaceId, actorId, action, entityType, entityId }) {
  return db.query(
    'INSERT INTO activity_log (workspace_id, actor_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)',
    [workspaceId, actorId, action, entityType, entityId],
  )
}
