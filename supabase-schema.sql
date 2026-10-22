-- Supabase SQL schema for the evangelism tracker

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  country TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_group_categories (
  group_id TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  needgod_net BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  event_timezone TEXT NOT NULL DEFAULT 'UTC',
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
ALTER TABLE groups ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
ALTER TABLE team_photos ADD COLUMN IF NOT EXISTS photo_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE team_photos ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_timezone TEXT;

UPDATE events
SET event_timezone = groups.timezone
FROM groups
WHERE events.group_id = groups.id
  AND events.event_timezone IS NULL;

ALTER TABLE events ALTER COLUMN event_timezone SET DEFAULT 'UTC';
ALTER TABLE events ALTER COLUMN event_timezone SET NOT NULL;

-- RLS policies for authenticated users and group-scoped application access.
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_group_categories ENABLE ROW LEVEL SECURITY;
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
    public.is_super_admin() OR group_id = public.current_profile_group_id()
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

DROP POLICY IF EXISTS admin_group_categories_select_for_super_admin ON admin_group_categories;
CREATE POLICY admin_group_categories_select_for_super_admin ON admin_group_categories
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS admin_group_categories_insert_for_super_admin ON admin_group_categories;
CREATE POLICY admin_group_categories_insert_for_super_admin ON admin_group_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS admin_group_categories_update_for_super_admin ON admin_group_categories;
CREATE POLICY admin_group_categories_update_for_super_admin ON admin_group_categories
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS admin_group_categories_delete_for_super_admin ON admin_group_categories;
CREATE POLICY admin_group_categories_delete_for_super_admin ON admin_group_categories
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

DROP FUNCTION IF EXISTS public.recent_group_witness_activity();
CREATE FUNCTION public.recent_group_witness_activity()
RETURNS TABLE(
  participants TEXT[],
  group_name TEXT,
  country TEXT,
  chat_count BIGINT,
  chat_ids TEXT[]
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  WITH recent_chats AS (
    SELECT
      chat_logs.id,
      chat_logs.group_id,
      groups.name AS group_name,
      groups.country,
      CASE
        WHEN COALESCE(cardinality(chat_logs.evangelists), 0) = 0
          THEN ARRAY[users.full_name]
        ELSE chat_logs.evangelists
      END AS evangelists
    FROM public.chat_logs AS chat_logs
    JOIN public.users AS users ON users.id = chat_logs.author_id
    JOIN public.groups AS groups ON groups.id = chat_logs.group_id
    WHERE auth.uid() IS NOT NULL
      AND chat_logs.created_at >= NOW() - INTERVAL '24 hours'
      AND chat_logs.created_at <= NOW()
  ),
  chats_with_teams AS (
    SELECT
      recent_chats.id,
      recent_chats.group_id,
      recent_chats.group_name,
      recent_chats.country,
      normalized_team.participant_keys,
      display_team.participants
    FROM recent_chats
    CROSS JOIN LATERAL (
      SELECT ARRAY_AGG(team.person_key ORDER BY team.person_key) AS participant_keys
      FROM (
        SELECT DISTINCT LOWER(BTRIM(person_name)) AS person_key
        FROM UNNEST(recent_chats.evangelists) AS names(person_name)
        WHERE BTRIM(person_name) <> ''
      ) AS team
    ) AS normalized_team
    CROSS JOIN LATERAL (
      SELECT ARRAY_AGG(team.person_name ORDER BY team.person_key) AS participants
      FROM (
        SELECT LOWER(BTRIM(person_name)) AS person_key, MIN(BTRIM(person_name)) AS person_name
        FROM UNNEST(recent_chats.evangelists) AS names(person_name)
        WHERE BTRIM(person_name) <> ''
        GROUP BY LOWER(BTRIM(person_name))
      ) AS team
    ) AS display_team
  )
  SELECT
    chats_with_teams.participants,
    chats_with_teams.group_name,
    chats_with_teams.country,
    COUNT(*)::BIGINT,
    ARRAY_AGG(chats_with_teams.id ORDER BY chats_with_teams.id)
  FROM chats_with_teams
  WHERE auth.uid() IS NOT NULL
    AND cardinality(chats_with_teams.participants) > 0
  GROUP BY
    chats_with_teams.participant_keys,
    chats_with_teams.participants,
    chats_with_teams.group_id,
    chats_with_teams.group_name,
    chats_with_teams.country
$$;

REVOKE ALL ON FUNCTION public.recent_group_witness_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recent_group_witness_activity() TO authenticated;

DROP FUNCTION IF EXISTS public.recent_group_witness_chats(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.recent_group_witness_chats(TEXT[]);
CREATE FUNCTION public.recent_group_witness_chats(
  p_chat_ids TEXT[]
)
RETURNS TABLE(
  id TEXT,
  author_id TEXT,
  author_name TEXT,
  group_name TEXT,
  person_name TEXT,
  log_date DATE,
  evangelists TEXT[],
  progress INTEGER,
  heard_gospel_count INTEGER,
  professed_count INTEGER,
  notes TEXT,
  location TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    chat_logs.id,
    chat_logs.author_id,
    users.full_name,
    groups.name,
    chat_logs.person_name,
    chat_logs.log_date,
    chat_logs.evangelists,
    chat_logs.progress,
    chat_logs.heard_gospel_count,
    chat_logs.professed_count,
    chat_logs.notes,
    chat_logs.location,
    chat_logs.photo_url,
    chat_logs.created_at
  FROM public.chat_logs AS chat_logs
  JOIN public.users AS users ON users.id = chat_logs.author_id
  JOIN public.groups AS groups ON groups.id = chat_logs.group_id
  WHERE auth.uid() IS NOT NULL
    AND chat_logs.id = ANY(p_chat_ids)
    AND chat_logs.created_at >= NOW() - INTERVAL '24 hours'
    AND chat_logs.created_at <= NOW()
  ORDER BY chat_logs.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.recent_group_witness_chats(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recent_group_witness_chats(TEXT[]) TO authenticated;

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

-- Storage RLS policies for public buckets (team_photos and chat_photos)
DROP POLICY IF EXISTS "Public storage read for team_photos" ON storage.objects;
CREATE POLICY "Public storage read for team_photos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'team_photos');

DROP POLICY IF EXISTS "Authenticated upload for team_photos" ON storage.objects;
CREATE POLICY "Authenticated upload for team_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team_photos');

DROP POLICY IF EXISTS "Public storage read for chat_photos" ON storage.objects;
CREATE POLICY "Public storage read for chat_photos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat_photos');

DROP POLICY IF EXISTS "Authenticated upload for chat_photos" ON storage.objects;
CREATE POLICY "Authenticated upload for chat_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat_photos');

-- You can add initial users and sample logs after you create your Supabase project and auth setup.

DROP FUNCTION IF EXISTS public.admin_user_login_status();
DROP FUNCTION IF EXISTS public.admin_user_setup_status();

CREATE FUNCTION public.admin_user_setup_status()
RETURNS TABLE(user_id TEXT, account_is_setup BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
BEGIN
  IF COALESCE(public.current_profile_role(), '') NOT IN ('super_admin', 'director', 'admin') THEN
    RAISE EXCEPTION 'Only system admins, directors, and admins can view account setup status.';
  END IF;

  RETURN QUERY
  SELECT
    app_user.id,
    auth_user.last_sign_in_at IS NOT NULL
      AND DATE_TRUNC('second', auth_user.last_sign_in_at)
        <> DATE_TRUNC('second', auth_user.created_at)
  FROM public.users AS app_user
  LEFT JOIN LATERAL (
    SELECT account.last_sign_in_at, account.created_at
    FROM auth.users AS account
    WHERE account.id::TEXT = app_user.auth_user_id
      OR LOWER(account.email) = LOWER(app_user.email)
    ORDER BY (account.id::TEXT = app_user.auth_user_id) DESC
    LIMIT 1
  ) AS auth_user ON TRUE
  WHERE public.is_super_admin()
     OR app_user.group_id = public.current_profile_group_id();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_setup_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_setup_status() TO authenticated;
