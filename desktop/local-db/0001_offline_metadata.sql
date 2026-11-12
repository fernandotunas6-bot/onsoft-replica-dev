-- SIGA Desktop: SQLite local v1. NÃO APLICAR no PostgreSQL/Supabase.
-- DDL apenas: não há abertura nativa neste commit.
-- A integração de runtime DEVE exigir SQLCipher (cipher_version + PRAGMA key
-- com chave do cofre) ANTES de abrir/criar esta base. SQLite normal é proibido
-- para dados escolares. Usar migrations transaccionais e verificar user_version.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS offline_contexts (
  school_id TEXT NOT NULL CHECK(length(school_id) >= 1 AND length(school_id) <= 128),
  actor_id TEXT NOT NULL CHECK(length(actor_id) >= 1 AND length(actor_id) <= 128),
  device_id TEXT NOT NULL CHECK(length(device_id) >= 1 AND length(device_id) <= 128),
  bootstrap_at TEXT NOT NULL,
  permission_expires_at TEXT NOT NULL,
  PRIMARY KEY (school_id, actor_id, device_id)
);

-- O payload é SEMPRE um envelope cifrado; nunca JSON de alunos em texto simples.
-- Um mesmo op_id mantém a mesma escola, actor, dispositivo e corpo até ao ACK.
CREATE TABLE IF NOT EXISTS offline_outbox (
  op_id TEXT PRIMARY KEY NOT NULL CHECK(length(op_id) >= 1 AND length(op_id) <= 128),
  school_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('attendance.submit', 'grades.term')),
  payload_ciphertext BLOB NOT NULL CHECK(length(payload_ciphertext) > 0),
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending', 'sending', 'acknowledged', 'conflict', 'rejected')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  server_revision INTEGER CHECK(server_revision IS NULL OR server_revision >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (school_id, actor_id, device_id)
    REFERENCES offline_contexts(school_id, actor_id, device_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_offline_outbox_pending
  ON offline_outbox(school_id, actor_id, device_id, state, created_at, op_id);

CREATE TRIGGER IF NOT EXISTS trg_offline_outbox_immutable
BEFORE UPDATE OF op_id, school_id, actor_id, device_id, kind,
  payload_ciphertext, expected_revision ON offline_outbox
BEGIN
  SELECT RAISE(ABORT, 'offline operation provenance and payload are immutable');
END;

-- ACKs do servidor não equivalem a sucesso presumido após timeout.
CREATE TABLE IF NOT EXISTS offline_receipts (
  op_id TEXT PRIMARY KEY NOT NULL,
  school_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  server_revision INTEGER NOT NULL CHECK(server_revision >= 0),
  received_at TEXT NOT NULL,
  FOREIGN KEY (op_id) REFERENCES offline_outbox(op_id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, actor_id, device_id)
    REFERENCES offline_contexts(school_id, actor_id, device_id)
    ON DELETE RESTRICT
);
CREATE TRIGGER IF NOT EXISTS trg_offline_receipts_origin
BEFORE INSERT ON offline_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM offline_outbox o
  WHERE o.op_id = NEW.op_id AND o.school_id = NEW.school_id
    AND o.actor_id = NEW.actor_id AND o.device_id = NEW.device_id
)
BEGIN
  SELECT RAISE(ABORT, 'receipt origin differs from original operation');
END;

-- Cursor opaco e isolado por stream + contexto; não partilhar cursores entre escolas.
CREATE TABLE IF NOT EXISTS offline_cursors (
  school_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  stream TEXT NOT NULL CHECK(length(stream) BETWEEN 1 AND 100),
  cursor_ciphertext BLOB NOT NULL CHECK(length(cursor_ciphertext) > 0),
  synced_at TEXT NOT NULL,
  PRIMARY KEY (school_id, actor_id, device_id, stream),
  FOREIGN KEY (school_id, actor_id, device_id)
    REFERENCES offline_contexts(school_id, actor_id, device_id)
    ON DELETE RESTRICT
);

-- Conflito retido para revisão humana (não aplicar 'last write wins').
CREATE TABLE IF NOT EXISTS offline_conflicts (
  op_id TEXT PRIMARY KEY NOT NULL,
  school_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  server_revision INTEGER NOT NULL CHECK(server_revision >= 0),
  server_payload_ciphertext BLOB,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'resolved')),
  observed_at TEXT NOT NULL,
  FOREIGN KEY (op_id) REFERENCES offline_outbox(op_id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, actor_id, device_id)
    REFERENCES offline_contexts(school_id, actor_id, device_id)
    ON DELETE RESTRICT
);
CREATE TRIGGER IF NOT EXISTS trg_offline_conflicts_origin
BEFORE INSERT ON offline_conflicts
WHEN NOT EXISTS (
  SELECT 1 FROM offline_outbox o
  WHERE o.op_id = NEW.op_id AND o.school_id = NEW.school_id
    AND o.actor_id = NEW.actor_id AND o.device_id = NEW.device_id
)
BEGIN
  SELECT RAISE(ABORT, 'conflict origin differs from original operation');
END;

-- Exclusões recebidas do servidor: nunca ressuscitar registos removidos.
CREATE TABLE IF NOT EXISTS offline_tombstones (
  school_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  stream TEXT NOT NULL CHECK(length(stream) BETWEEN 1 AND 100),
  entity_id TEXT NOT NULL,
  server_revision INTEGER NOT NULL CHECK(server_revision >= 0),
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (school_id, actor_id, device_id, stream, entity_id),
  FOREIGN KEY (school_id, actor_id, device_id)
    REFERENCES offline_contexts(school_id, actor_id, device_id)
    ON DELETE RESTRICT
);

PRAGMA user_version = 1;
