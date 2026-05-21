-- Migration: enable PostGIS for distance-based matching.
--
-- Background:
--   Phase 1 of distance-based matching needs a geography(POINT, 4326) column
--   on profiles plus a GIST index to make ST_DWithin queries fast. Both
--   require the PostGIS extension. Supabase ships PostGIS available (not
--   installed). We pin it to the `extensions` schema per Supabase convention
--   to keep public clean and avoid polluting pg_dump output.
--
--   This is a one-time enablement. CREATE EXTENSION IF NOT EXISTS is
--   idempotent — safe to re-run on any environment.
--
-- Rollback:
--   DROP EXTENSION postgis CASCADE;
--   (cascades through any geography columns / indexes built on top — only
--   run this if you're tearing distance-based matching out completely.)

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
