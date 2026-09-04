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

CREATE TABLE IF NOT EXISTS team_photos (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  photo_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT DEFAULT '',
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
ALTER TABLE team_photos ADD COLUMN IF NOT EXISTS photo_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE team_photos ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

-- RLS policies for authenticated users and group-scoped application access.
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_photos ENABLE ROW LEVEL SECURITY;

-- These helpers avoid recursive RLS checks when policies need the current profile.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid()::TEXT
     OR LOWER(email) = LOWER((auth.jwt() ->> 'email'))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.users WHERE id = public.current_profile_id()
$$;

CREATE OR REPLACE FUNCTION public.current_profile_group_id()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT group_id FROM public.users WHERE id = public.current_profile_id()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_profile_role() = 'super_admin'
$$;

CREATE OR REPLACE FUNCTION public.is_group_leader(target_group_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_super_admin()
      OR (public.current_profile_group_id() = target_group_id
          AND public.current_profile_role() IN ('director', 'admin'))
$$;

DROP POLICY IF EXISTS team_photos_select_for_group ON team_photos;
CREATE POLICY team_photos_select_for_group ON team_photos
  FOR SELECT TO authenticated
  USING (
    (public.is_group_leader(group_id) OR group_id = public.current_profile_group_id())
    AND (public.is_group_leader(group_id) OR author_id = public.current_profile_id())
  );

DROP POLICY IF EXISTS team_photos_insert_for_owner_or_leader ON team_photos;
CREATE POLICY team_photos_insert_for_owner_or_leader ON team_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_group_leader(group_id) OR group_id = public.current_profile_group_id())
    AND (public.is_group_leader(group_id) OR author_id = public.current_profile_id())
  );

DROP POLICY IF EXISTS team_photos_update_for_owner_or_leader ON team_photos;
CREATE POLICY team_photos_update_for_owner_or_leader ON team_photos
  FOR UPDATE TO authenticated
  USING (public.is_group_leader(group_id) OR author_id = public.current_profile_id())
  WITH CHECK (public.is_group_leader(group_id) OR author_id = public.current_profile_id());

DROP POLICY IF EXISTS team_photos_delete_for_owner_or_leader ON team_photos;
CREATE POLICY team_photos_delete_for_owner_or_leader ON team_photos
  FOR DELETE TO authenticated
  USING (public.is_group_leader(group_id) OR author_id = public.current_profile_id());

DROP POLICY IF EXISTS groups_select_for_member ON groups;
CREATE POLICY groups_select_for_member ON groups
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.current_profile_group_id());

DROP POLICY IF EXISTS groups_insert_for_leader ON groups;
CREATE POLICY groups_insert_for_leader ON groups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.current_profile_role() IN ('director', 'admin'));

DROP POLICY IF EXISTS groups_update_for_leader ON groups;
CREATE POLICY groups_update_for_leader ON groups
  FOR UPDATE TO authenticated
  USING (public.is_group_leader(id))
  WITH CHECK (public.is_group_leader(id));

DROP POLICY IF EXISTS groups_delete_for_super_admin ON groups;
CREATE POLICY groups_delete_for_super_admin ON groups
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS users_select_for_group ON users;
CREATE POLICY users_select_for_group ON users
  FOR SELECT TO authenticated
  USING (
    id = public.current_profile_id()
    OR public.is_group_leader(group_id)
    OR (group_id IS NOT NULL AND group_id = public.current_profile_group_id())
  );

DROP POLICY IF EXISTS users_insert_for_leader ON users;
CREATE POLICY users_insert_for_leader ON users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_leader(group_id));

DROP POLICY IF EXISTS users_update_for_owner_or_leader ON users;
CREATE POLICY users_update_for_owner_or_leader ON users
  FOR UPDATE TO authenticated
  USING (id = public.current_profile_id() OR public.is_group_leader(group_id))
  WITH CHECK (id = public.current_profile_id() OR public.is_group_leader(group_id));

DROP POLICY IF EXISTS users_delete_for_leader ON users;
CREATE POLICY users_delete_for_leader ON users
  FOR DELETE TO authenticated
  USING (public.is_group_leader(group_id));

DROP POLICY IF EXISTS chat_logs_select_for_group ON chat_logs;
CREATE POLICY chat_logs_select_for_group ON chat_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR group_id = public.current_profile_group_id());

DROP POLICY IF EXISTS chat_logs_insert_for_group ON chat_logs;
CREATE POLICY chat_logs_insert_for_group ON chat_logs
  FOR INSERT TO authenticated
  WITH CHECK (group_id = public.current_profile_group_id() AND author_id = public.current_profile_id());

DROP POLICY IF EXISTS chat_logs_update_for_owner_or_leader ON chat_logs;
CREATE POLICY chat_logs_update_for_owner_or_leader ON chat_logs
  FOR UPDATE TO authenticated
  USING (author_id = public.current_profile_id() OR public.is_group_leader(group_id))
  WITH CHECK (author_id = public.current_profile_id() OR public.is_group_leader(group_id));

DROP POLICY IF EXISTS chat_logs_delete_for_owner_or_leader ON chat_logs;
CREATE POLICY chat_logs_delete_for_owner_or_leader ON chat_logs
  FOR DELETE TO authenticated
  USING (author_id = public.current_profile_id() OR public.is_group_leader(group_id));

DROP POLICY IF EXISTS events_select_for_group ON events;
CREATE POLICY events_select_for_group ON events
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR group_id = public.current_profile_group_id());

DROP POLICY IF EXISTS events_insert_for_leader ON events;
CREATE POLICY events_insert_for_leader ON events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_leader(group_id));

DROP POLICY IF EXISTS events_update_for_leader ON events;
CREATE POLICY events_update_for_leader ON events
  FOR UPDATE TO authenticated
  USING (public.is_group_leader(group_id))
  WITH CHECK (public.is_group_leader(group_id));

DROP POLICY IF EXISTS events_delete_for_leader ON events;
CREATE POLICY events_delete_for_leader ON events
  FOR DELETE TO authenticated
  USING (public.is_group_leader(group_id));

DROP POLICY IF EXISTS event_rsvps_select_for_group ON event_rsvps;
CREATE POLICY event_rsvps_select_for_group ON event_rsvps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = event_rsvps.event_id
      AND (public.is_super_admin() OR events.group_id = public.current_profile_group_id())
  ));

DROP POLICY IF EXISTS event_rsvps_insert_for_member ON event_rsvps;
CREATE POLICY event_rsvps_insert_for_member ON event_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_profile_id()
    AND EXISTS (SELECT 1 FROM public.events WHERE events.id = event_rsvps.event_id AND events.group_id = public.current_profile_group_id())
  );

DROP POLICY IF EXISTS event_rsvps_update_for_member ON event_rsvps;
CREATE POLICY event_rsvps_update_for_member ON event_rsvps
  FOR UPDATE TO authenticated
  USING (user_id = public.current_profile_id())
  WITH CHECK (user_id = public.current_profile_id());

DROP POLICY IF EXISTS event_rsvps_delete_for_member ON event_rsvps;
CREATE POLICY event_rsvps_delete_for_member ON event_rsvps
  FOR DELETE TO authenticated
  USING (user_id = public.current_profile_id());

DROP POLICY IF EXISTS resources_select_for_group ON resources;
CREATE POLICY resources_select_for_group ON resources
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR group_id = public.current_profile_group_id());

DROP POLICY IF EXISTS resources_insert_for_leader ON resources;
CREATE POLICY resources_insert_for_leader ON resources
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_leader(group_id));

DROP POLICY IF EXISTS resources_update_for_leader ON resources;
CREATE POLICY resources_update_for_leader ON resources
  FOR UPDATE TO authenticated
  USING (public.is_group_leader(group_id))
  WITH CHECK (public.is_group_leader(group_id));

DROP POLICY IF EXISTS resources_delete_for_leader ON resources;
CREATE POLICY resources_delete_for_leader ON resources
  FOR DELETE TO authenticated
  USING (public.is_group_leader(group_id));

-- You can add initial users and sample logs after you create your Supabase project and auth setup.
