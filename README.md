# Evangelism Tracker

This app is a localStorage-based tracking app for evangelism outreach, local groups, events, and resources.

## Current state
- vanilla HTML/CSS/JS app
- role-based local group logic
- chat logs with progress counters and optional photos
- localStorage-based persistence

## Database migration plan
The app is now being prepared for a Supabase migration.

Files added for the database transition:
- `supabase.js` – Supabase client setup
- `supabase-schema.sql` – initial schema for users, groups, logs, events, and resources

## Next steps
1. Create a Supabase project.
2. Add your project URL and anon key to `supabase.js`.
3. Run the SQL in `supabase-schema.sql` in the Supabase SQL editor.
4. Replace localStorage operations with Supabase queries in `app.js`.
5. Add auth and secure row-level policies.

## Notes
The current app still works with localStorage until the database layer is connected.
