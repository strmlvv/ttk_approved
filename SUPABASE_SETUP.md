# Supabase integration preparation

## Code changes

- `@supabase/supabase-js` is installed.
- The typed browser client reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and an explicit `VITE_SUPABASE_ENABLED=true` switch.
- With the switch off (the default), current localStorage/mock behavior remains enabled.
- Organizer login/gating uses Supabase Auth when enabled; map list and editor reads filter by the current organizer. Public reads are restricted to published/public maps.
- Map edits stay as a local draft and call the transactional RPC only after pressing Save. On RPC error, the draft is retained.

## Environment file

Copy `.env.example` to `.env.local` and set the Project URL and publishable/anon key from Supabase Dashboard -> Project Settings -> API:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
VITE_SUPABASE_ENABLED=true
```

Never use `service_role` or a secret key in browser code. `.env.local` is git-ignored. Restart Vite after editing it.

## SQL files and safe order

- Fresh-project proposals: `supabase/proposed/01_schema.sql`, then `supabase/proposed/02_rls_and_atomic_save.sql`.
- Previous migration drafts are preserved in the active `supabase/migrations/` and copied to `supabase/proposed/legacy/`. They have incompatible assumptions and may mutate rows. **Do not run `supabase db push` from this workspace** until the active migration history has been reviewed and reconciled.
- No migration has been applied remotely by this task.

In Dashboard -> SQL Editor, first inspect the target schema and migration history. If tables already exist, stop and create a reviewed additive migration; do not run the fresh-project bootstrap. If the project is confirmed new/empty, review the proposed schema, apply 01, then 02 manually. Verify RLS and Auth before enabling the frontend flag.

## Current verification status

The project builds, and mock/manual-save behavior remains available. A real Supabase URL/key was not provided, so connectivity, migrations, RLS, RPC, and remote persistence are **not verified**.
