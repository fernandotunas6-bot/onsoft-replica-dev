-- Uma só conversa por par de pessoas: dois pedidos ao mesmo tempo criavam
-- duas. pair_key = "<uid menor>|<uid maior>".
ALTER TABLE Conversations ADD COLUMN pair_key TEXT;

-- Conversas que já existam ganham a chave a partir dos dois membros.
UPDATE Conversations
SET pair_key = (
    SELECT MIN(m.user_uid) || '|' || MAX(m.user_uid)
    FROM ConversationMembers m WHERE m.conversation_id = Conversations.id
)
WHERE pair_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_school_pair
    ON Conversations(school_id, pair_key);
