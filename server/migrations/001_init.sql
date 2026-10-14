-- Kullanıcılar
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Çalışma alanları (takımlar)
CREATE TABLE workspaces (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Üyelik ve roller: admin yönetir, member çalışır
CREATE TABLE workspace_members (
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members (user_id);

-- Projeler
CREATE TABLE projects (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX projects_workspace_idx ON projects (workspace_id);

-- Görevler
CREATE TABLE tasks (
  id          BIGSERIAL PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_by  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_status_idx ON tasks (project_id, status, position);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id);

-- Görev yorumları
CREATE TABLE comments (
  id         BIGSERIAL PRIMARY KEY,
  task_id    BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_task_idx ON comments (task_id, created_at);

-- Etkinlik geçmişi
CREATE TABLE activity_log (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    BIGINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_workspace_idx ON activity_log (workspace_id, created_at DESC);
