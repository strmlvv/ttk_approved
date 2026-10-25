# Manual saving for organizer maps

- Editor edits, point movement/add/delete, paths, publication settings, floor-plan selection and panorama add/replace/remove remain in React draft state.
- `Сохранить изменения` is the only editor operation that persists the map snapshot. The button locks while saving; the last saved snapshot changes only after the repository confirms the write. On error, the draft stays available for retry.
- `Отменить изменения` asks for confirmation and restores the last saved snapshot.
- Leaving the editor warns about unsaved changes; the in-app dialog offers stay, discard-and-leave, or save-and-leave. Browser refresh/close uses the browser's native beforeunload warning.
- The public map reads the saved snapshot and returns no map for unpublished slugs.
- Zoom and viewport panning are view-only and are not part of the map snapshot.
- The editor can stage one panorama per place; replacing/removing it affects the draft until save.

## Persistence modes

With no Supabase client configured, Save writes the complete snapshot to localStorage and displays `Сохранено локально (демо-режим)`. With Supabase configured, it calls the transactional `save_map_snapshot` RPC and only then reports `Изменения сохранены`. The current workspace has no compatible database configured: the supplied DataSpace CE package contains only its Customer/Task example, not the app's maps/points/paths/panoramas schema. Apply and adapt the migration to a verified schema, configure the Supabase client and RLS, before treating the feature as production server persistence.
