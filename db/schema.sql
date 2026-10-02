CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL    PRIMARY KEY,
  telegram_id BIGINT       NOT NULL,
  chat_id     BIGINT       NOT NULL,
  text        TEXT         NOT NULL,
  sent_at     TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS messages_sent_at_idx ON messages (sent_at DESC, id DESC);

-- Web entries have no Telegram ids; `source` tells the two inputs apart.
-- Idempotent, so `npm run db:init` upgrades an existing table in place.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'telegram'
  CHECK (source IN ('telegram', 'web'));
ALTER TABLE messages ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN chat_id DROP NOT NULL;

-- Daily check-in. Questions are retired, never deleted, and each answer keeps
-- a copy of the wording it was given, so editing a question never changes the
-- past.
CREATE TABLE IF NOT EXISTS questions (
  id          BIGSERIAL    PRIMARY KEY,
  text        TEXT         NOT NULL,
  position    INTEGER      NOT NULL,
  retired_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS answers (
  id             BIGSERIAL    PRIMARY KEY,
  day            DATE         NOT NULL,
  question_id    BIGINT       NOT NULL REFERENCES questions (id),
  question_text  TEXT         NOT NULL,
  text           TEXT         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (day, question_id)
);

-- Starter questions, inserted only into an empty table.
INSERT INTO questions (text, position)
SELECT q.text, q.position
FROM (VALUES
  ('What made me anxious today, and what did I tell myself about it?', 1),
  ('What did I handle well today?', 2),
  ('What am I carrying into tomorrow?', 3)
) AS q (text, position)
WHERE NOT EXISTS (SELECT 1 FROM questions);

-- Where a post-it sits on the board, as fractions of the space it can move
-- in. NULL means "default grid position".
ALTER TABLE answers ADD COLUMN IF NOT EXISTS board_x REAL
  CHECK (board_x BETWEEN 0 AND 1);
ALTER TABLE answers ADD COLUMN IF NOT EXISTS board_y REAL
  CHECK (board_y BETWEEN 0 AND 1);

-- One sticker per day, part of the private check-in.
CREATE TABLE IF NOT EXISTS day_stickers (
  day         DATE         PRIMARY KEY,
  sticker     TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Categories every entry is classified into. Like questions, they are retired,
-- never deleted. `updated_at` moves when the wording changes, which makes every
-- earlier classification against it stale.
CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL    PRIMARY KEY,
  text        TEXT         NOT NULL,
  position    INTEGER      NOT NULL,
  retired_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Starter categories, inserted only into an empty table.
INSERT INTO categories (text, position)
SELECT c.text, c.position
FROM (VALUES
  ('Anxiety or worry', 1),
  ('Self-doubt', 2),
  ('Work', 3),
  ('Relationships', 4),
  ('Health and body', 5),
  ('Gratitude and wins', 6),
  ('Catastrophising', 7),
  ('Planning and the future', 8)
) AS c (text, position)
WHERE NOT EXISTS (SELECT 1 FROM categories);

-- One row per entry and category: Jev's probability that the entry fits it.
-- An entry is a thought or a check-in answer, never both. `classified_at` is
-- when the entry and category were read, so a later edit to either is newer
-- and marks the row stale.
CREATE TABLE IF NOT EXISTS classifications (
  id             BIGSERIAL    PRIMARY KEY,
  message_id     BIGINT       REFERENCES messages (id) ON DELETE CASCADE,
  answer_id      BIGINT       REFERENCES answers (id) ON DELETE CASCADE,
  category_id    BIGINT       NOT NULL REFERENCES categories (id),
  probability    REAL         NOT NULL CHECK (probability BETWEEN 0 AND 1),
  classified_at  TIMESTAMPTZ  NOT NULL,
  CHECK ((message_id IS NULL) <> (answer_id IS NULL)),
  UNIQUE (message_id, category_id),
  UNIQUE (answer_id, category_id)
);
