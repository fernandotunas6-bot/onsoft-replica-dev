-- Conversas 1:1 dentro da escola (encarregado ↔ professor/direcção, e entre
-- funcionários). Encarregados não conversam entre si.
CREATE TABLE IF NOT EXISTS Conversations (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TEXT,
    last_preview TEXT,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ConversationMembers (
    conversation_id TEXT NOT NULL,
    user_uid TEXT NOT NULL,
    last_read_at TEXT,
    PRIMARY KEY (conversation_id, user_uid),
    FOREIGN KEY (conversation_id) REFERENCES Conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
    ON ConversationMembers(user_uid);

CREATE TABLE IF NOT EXISTS Messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    sender_uid TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    FOREIGN KEY (conversation_id) REFERENCES Conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON Messages(conversation_id, created_at);
