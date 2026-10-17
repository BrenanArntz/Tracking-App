# Outreach Tracker

This app tracks outreach conversations, local groups, events, and shared resources.

## Current state
- Vanilla HTML/CSS/JS app
- Role-based local group logic
- Chat logs with progress counters and optional photos
- Supabase authentication and persistence with localStorage fallback

## Supabase setup

1. Create a Supabase project.
2. Add your project URL and anon key to `supabase.js`.
3. Run the SQL in `supabase-schema.sql` in the Supabase SQL editor.

For existing projects, run the updated `supabase-schema.sql` in the SQL editor to enable role-restricted account setup status in team rosters. Accounts whose last sign-in and creation match to the second are marked as not set up.

To enable removal of a user's Supabase Auth account along with their profile, deploy the Edge Function:

```bash
supabase functions deploy delete-user
```

The app uses localStorage as a fallback when Supabase is unavailable.
