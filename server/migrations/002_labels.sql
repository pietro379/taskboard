-- Etiketler: çalışma alanı bazında tanımlanır, görevlere çoktan çoğa bağlanır.
-- Renkler sabit bir paletten seçilir; arayüz her renge bir stil eşler.
CREATE TABLE labels (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT 'indigo'
               CHECK (color IN ('slate', 'red', 'amber', 'emerald', 'sky', 'indigo', 'violet', 'pink')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE task_labels (
  task_id  BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id BIGINT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
CREATE INDEX task_labels_label_idx ON task_labels (label_id);
