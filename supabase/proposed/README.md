# Supabase preparation (not applied)

## Fresh-project proposals

- `01_schema.sql`: maps, points, paths, one-optional-panorama-per-point, hotspots, indexes. A guard aborts when target relations already exist.
- `02_rls_and_atomic_save.sql`: owner/public RLS plus a transactional `save_map_snapshot` RPC.

## Historical drafts

The original `202610240001_panorama_one_to_one.sql` and `202610240002_atomic_map_snapshot.sql` remain in the active `supabase/migrations/` directory and are copied here as `legacy_...` for reference. They have incompatible assumptions (notably `places` vs the current `points` model). Do not execute these old files and do not run `supabase db push` until the existing migration history has been explicitly reconciled.

Nothing here has been applied remotely. For an existing Supabase project, inspect tables, constraints, RLS policies and `supabase_migrations.schema_migrations` first; prepare a reviewed additive/backfill migration. The fresh bootstrap is only for a confirmed empty schema.
