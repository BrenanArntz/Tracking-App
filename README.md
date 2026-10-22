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

For existing projects, run the updated `supabase-schema.sql` in the SQL editor to enable role-restricted account setup status in team rosters, the private NeedGod.net group category, country information for groups, and the cross-group witness summary and chat-detail RPCs. The category is only readable and editable by system admins. Group countries can be set on creation or changed by a system admin. All signed-in users can view the rolling 24-hour witness names, group countries, chat counts, and individual chats across groups. Accounts whose last sign-in and creation match to the second are marked as not set up.

To enable removal of a user's Supabase Auth account along with their profile, deploy the Edge Function:

```bash
supabase functions deploy delete-user
```

The app uses localStorage as a fallback when Supabase is unavailable.

## Release changelog

Before publishing an app update, change `APP_UPDATE_VERSION` and `APP_UPDATE_MESSAGE` near the top of `app.js`. List the member-facing features from that release as separate `-` bullets, and omit features that are only available to admins. The version should be unique for each release; the message is shown to each returning user once for that version. First-time users are not shown the changelog. Increase the `app.js` query version in `index.html` and the cache version in `sw.js` when needed to ensure clients receive the new update.
