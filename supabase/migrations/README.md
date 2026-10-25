# Existing migration drafts — manual review required

The files `202610240001_panorama_one_to_one.sql` and `202610240002_atomic_map_snapshot.sql` predate the current `points`-based editor. They are preserved unchanged but assume `places`/older snapshot details and the panorama migration includes duplicate cleanup. Do not run them blindly and do not run `supabase db push` until the target project's schema and Supabase migration history have been checked.

Fresh-project proposals are in `supabase/proposed/`. They are not active CLI migrations and have not been applied remotely.
