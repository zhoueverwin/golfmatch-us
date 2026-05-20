-- Profile field expansion (2026-05-20)
--
-- Adds the dating + golf-specific fields surfaced in the PM audit on
-- 2026-05-20. Schema additions are non-destructive — every new column
-- is nullable, so existing profile rows continue to load unchanged and
-- the new fields surface as empty rows in EditProfile until filled.
--
-- Deprecated columns (blood_type, favorite_club, personality_type) are
-- NOT dropped here. They are removed from the EditProfile UI in the
-- companion code commit; once we've verified no client still reads
-- them (give it a TestFlight cycle), a follow-up migration can drop
-- the columns. Keeping them around for now means existing profile
-- data isn't destroyed if we have to revert the UI change.

ALTER TABLE public.profiles
  -- Tier 1 — relationship intent + golf-credibility fields
  ADD COLUMN IF NOT EXISTS looking_for TEXT,
  ADD COLUMN IF NOT EXISTS handicap NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS home_course TEXT,
  -- Tier 2 — high-value dating + golf-lifestyle fields
  ADD COLUMN IF NOT EXISTS walking_or_riding TEXT,
  ADD COLUMN IF NOT EXISTS dominant_hand TEXT,
  ADD COLUMN IF NOT EXISTS drinking TEXT,
  ADD COLUMN IF NOT EXISTS has_kids TEXT,
  ADD COLUMN IF NOT EXISTS wants_kids TEXT,
  ADD COLUMN IF NOT EXISTS playing_frequency TEXT,
  -- Tier 3 — common dating fields
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS education TEXT,
  ADD COLUMN IF NOT EXISTS pets TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[],
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS politics TEXT;

-- Index on handicap so range-based discovery (e.g. find users with
-- handicap < 15) is cheap. The other new TEXT enums are usually
-- equality-filtered and the table is small enough that adding indexes
-- for each would be premature.
CREATE INDEX IF NOT EXISTS profiles_handicap_idx ON public.profiles (handicap);

-- Sanity check the handicap range. Real values are roughly -10 to 54.
-- Using a permissive CHECK so we can catch garbage inputs without
-- pinning ourselves to the wheel picker's exact range.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_handicap_range CHECK (
    handicap IS NULL OR (handicap >= -10 AND handicap <= 60)
  );

COMMENT ON COLUMN public.profiles.looking_for IS
  'Relationship intent. Free-form text (UI enforces the option set).';
COMMENT ON COLUMN public.profiles.handicap IS
  'USGA handicap index. Negative values are plus handicaps (better than scratch).';
COMMENT ON COLUMN public.profiles.home_course IS
  'Home / favorite golf course. Free-form text for v1; eventually an autocomplete against a course directory.';
COMMENT ON COLUMN public.profiles.walking_or_riding IS
  'Preferred round style: walking | riding | either.';
COMMENT ON COLUMN public.profiles.dominant_hand IS
  'Right-handed | Left-handed.';
COMMENT ON COLUMN public.profiles.drinking IS
  'Drinking preference: never | socially | regularly.';
COMMENT ON COLUMN public.profiles.has_kids IS
  'Has children: yes | no | prefer_not_to_say.';
COMMENT ON COLUMN public.profiles.wants_kids IS
  'Wants children: yes | no | maybe | prefer_not_to_say.';
COMMENT ON COLUMN public.profiles.playing_frequency IS
  'How often they play: weekly | a_few_times_a_month | monthly | occasionally.';
COMMENT ON COLUMN public.profiles.pets IS
  'Pet ownership: dog | cat | other | none | prefer_not_to_say.';
COMMENT ON COLUMN public.profiles.religion IS
  'Religion. Optional; users can choose prefer_not_to_say.';
COMMENT ON COLUMN public.profiles.politics IS
  'Politics. Optional; users can choose prefer_not_to_say.';
