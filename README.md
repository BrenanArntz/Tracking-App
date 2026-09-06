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

The app uses localStorage as a fallback when Supabase is unavailable.
