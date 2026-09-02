-- Supabase SQL schema for the evangelism tracker

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('member', 'admin', 'director', 'super_admin')) DEFAULT 'member',
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_logs (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL,
  log_date DATE NOT NULL,
  evangelists TEXT[] NOT NULL DEFAULT '{}',
  progress INTEGER NOT NULL DEFAULT 0,
  heard_gospel_count INTEGER NOT NULL DEFAULT 0,
  professed_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  location TEXT DEFAULT '',
  photo_url TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_datetime TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'Confirmed',
  location TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  default_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS default_key TEXT;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';

-- RLS bootstrap policies required for profile lookup after Supabase Auth login.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own_profile ON users;
CREATE POLICY users_select_own_profile ON users
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()::TEXT
    OR LOWER(email) = LOWER((auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS users_update_own_profile ON users;
CREATE POLICY users_update_own_profile ON users
  FOR UPDATE TO authenticated
  USING (
    auth_user_id = auth.uid()::TEXT
    OR LOWER(email) = LOWER((auth.jwt() ->> 'email'))
  )
  WITH CHECK (
    auth_user_id = auth.uid()::TEXT
    OR LOWER(email) = LOWER((auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS groups_select_for_member ON groups;
CREATE POLICY groups_select_for_member ON groups
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT group_id
      FROM users
      WHERE auth_user_id = auth.uid()::TEXT
        OR LOWER(email) = LOWER((auth.jwt() ->> 'email'))
    )
  );

-- Example seed data for a Metro group
INSERT INTO groups (id, name)
VALUES ('metro_ministry', 'Metro Ministry')
ON CONFLICT (name) DO NOTHING;

-- You can add initial users and sample logs after you create your Supabase project and auth setup.
