# Spring Balls public presets

Spring Balls works completely without a backend: built-in presets ship with the site, browser presets use `localStorage`, and share links contain a validated version-1 preset. Public gallery persistence is an optional Supabase connection.

## Intended behavior

- Anyone can browse and load public presets.
- A visitor signs in anonymously only when they choose **Publish**.
- Published rows are owned by that anonymous Supabase user.
- The same browser session can delete its own published rows.
- Clearing browser data loses the anonymous identity; there is no account recovery in version 1.
- Public presets cannot update in place. Editing and publishing creates a new row.
- The toy remains usable if Supabase is missing or unavailable.

## Setup still required

1. Create a Supabase project.
2. Apply `supabase/migrations/20260922000000_spring_balls_presets.sql` in the SQL editor or with the Supabase CLI.
3. Enable anonymous sign-ins in Supabase Auth.
4. Create a Cloudflare Turnstile widget for `flogost.com` and enable Turnstile under Supabase Auth bot protection.
5. Add these GitHub Actions repository variables:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `PUBLIC_TURNSTILE_SITE_KEY`
6. Pass those variables into the Astro build in `.github/workflows/deploy.yml`.
7. Implement the gallery client only after the real project and Turnstile keys are available, so anonymous authentication and RLS can be exercised against the deployed policy.

Never expose a Supabase secret key, service-role key, or Turnstile secret in Astro client code or GitHub repository variables. The Supabase publishable key and Turnstile site key are intentionally public; their corresponding secret keys stay in their service dashboards.

## Data boundary

The database stores only:

- preset UUID
- anonymous owner UUID
- preset name
- schema version
- validated settings JSON
- creation timestamp

No email address, profile, free-form description, comments, likes, or analytics are part of version 1. This keeps the public surface small and makes manual moderation possible from the Supabase table editor.
