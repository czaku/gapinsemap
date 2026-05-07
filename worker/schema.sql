-- D1 schema for the Gap in SE Map encrypted submission system.
--
-- The Worker stores ciphertext only. It cannot decrypt anything in this table.
-- The only plaintext fields are operational metadata used for stats and ordering:
--   area: postcode district (e.g. "SE17") — needed for the public by-area
--         breakdown on the stats page. The campaign is publicly about these
--         postcodes, so this leaks no individual identity.
--   created_at: unix epoch in milliseconds.
--   status: pending | approved | rejected — moderation state.

CREATE TABLE IF NOT EXISTS submissions (
  id           TEXT PRIMARY KEY,
  v            TEXT NOT NULL,            -- protocol version, e.g. "gapinsemap-v1"
  eph_pub      TEXT NOT NULL,            -- base64 X25519 ephemeral public key
  nonce        TEXT NOT NULL,            -- base64 AES-GCM nonce
  ciphertext   TEXT NOT NULL,            -- base64 AES-GCM ciphertext (incl. tag)
  area         TEXT NOT NULL,            -- postcode district, e.g. "SE17"
  created_at   INTEGER NOT NULL,         -- unix ms
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  moderated_at INTEGER                   -- unix ms when status changed
);

CREATE INDEX IF NOT EXISTS idx_status_created ON submissions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_area ON submissions(area);

-- Aggregate counters table — small, fast read for /count endpoint.
-- Maintained by triggers below.
CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER IF NOT EXISTS sub_inc AFTER INSERT ON submissions
BEGIN
  INSERT INTO counters(key, value) VALUES('total', 1)
    ON CONFLICT(key) DO UPDATE SET value = value + 1;
  INSERT INTO counters(key, value) VALUES('area:' || NEW.area, 1)
    ON CONFLICT(key) DO UPDATE SET value = value + 1;
  INSERT INTO counters(key, value) VALUES('status:' || NEW.status, 1)
    ON CONFLICT(key) DO UPDATE SET value = value + 1;
END;

CREATE TRIGGER IF NOT EXISTS sub_status_change AFTER UPDATE OF status ON submissions
WHEN OLD.status IS NOT NEW.status
BEGIN
  UPDATE counters SET value = value - 1 WHERE key = 'status:' || OLD.status;
  INSERT INTO counters(key, value) VALUES('status:' || NEW.status, 1)
    ON CONFLICT(key) DO UPDATE SET value = value + 1;
END;
