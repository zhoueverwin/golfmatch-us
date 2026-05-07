# Database Migrations

## Current State (2026-01-01)

The production database (`rriwpoqhbgvprbhomckk`) has 117 migrations already applied that were run directly via Supabase dashboard or other means. These migrations are not tracked in this directory.

**Production Database** is the current source of truth with all tables, RLS policies, and functions already in place.

## Going Forward

All new database changes should be created as migration files in this directory:

```bash
# Create a new migration
supabase migration new feature_description

# Test locally
supabase db reset

# Commit to git
git add supabase/migrations/
git commit -m "Add migration for feature XYZ"
```

## Supabase Branching

With branching enabled:
- Preview branches will be created from the current production state
- New migrations in this directory will be automatically applied to preview branches
- When PR is merged, migrations are automatically applied to production

## Historical Migrations

The original migrations from `/database/migrations/` were run directly on production and are not tracked here. The current schema represents the cumulative result of all those migrations.
