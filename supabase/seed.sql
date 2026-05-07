-- Supabase Seed Data for GolfMatch
-- This file populates preview branches with test data
-- DO NOT include real production user data!

-- Clean up existing test data (if any)
DELETE FROM profiles WHERE user_id LIKE 'test-%';

-- Insert test golfer profiles for AI matching testing
INSERT INTO profiles (id, user_id, name, age, gender, location, prefecture, golf_skill_level, average_score, bio, is_verified, last_active_at, birth_date)
VALUES
  -- Test users for 2-player matching
  (gen_random_uuid(), 'test-user-1', 'Test Tarou', 28, 'male', 'New York, NY', 'New York', 'Intermediate', 95, '3 years of golf under my belt — weekend golfer!', true, now(), '1996-01-15'),
  (gen_random_uuid(), 'test-user-2', 'Test Hanako', 32, 'female', 'New York, NY', 'New York', 'Advanced', 85, 'Love golf — let''s go play a round together!', true, now(), '1992-05-20'),
  (gen_random_uuid(), 'test-user-3', 'Golf Jiro', 35, 'male', 'Los Angeles, CA', 'California', 'Intermediate', 92, 'Casual golfer, just out here having fun.', true, now(), '1989-03-10'),
  (gen_random_uuid(), 'test-user-4', 'Swing Saburou', 29, 'male', 'New York, NY', 'New York', 'Beginner', 110, 'Beginner here — just want to enjoy the game!', true, now(), '1995-08-25'),

  -- Test users for 4-player matching
  (gen_random_uuid(), 'test-user-5', 'Pro Yamada', 40, 'male', 'Houston, TX', 'Texas', 'Pro', 72, 'Pro golfer. Looking for a fun round.', true, now(), '1984-11-05'),
  (gen_random_uuid(), 'test-user-6', 'Beginner Sato', 25, 'female', 'Houston, TX', 'Texas', 'Beginner', 120, 'Just started playing golf!', true, now(), '1999-07-12'),
  (gen_random_uuid(), 'test-user-7', 'Mid-Tier Suzuki', 33, 'male', 'Chicago, IL', 'Illinois', 'Intermediate', 88, 'Aiming to break 80.', true, now(), '1991-02-18'),
  (gen_random_uuid(), 'test-user-8', 'Advanced Tanaka', 38, 'female', 'Atlanta, GA', 'Georgia', 'Advanced', 78, 'Single-digit handicap player.', true, now(), '1986-09-30'),

  -- Additional test users for edge cases
  (gen_random_uuid(), 'test-user-9', 'EdgeCase1', 45, 'male', 'Anchorage, AK', 'Alaska', 'Intermediate', 95, 'Test user from out of state.', true, now(), '1979-04-22'),
  (gen_random_uuid(), 'test-user-10', 'EdgeCase2', 22, 'female', 'Honolulu, HI', 'Hawaii', 'Beginner', 115, 'Young golfer.', true, now(), '2002-12-08');

-- Insert some sample posts from test users (for timeline testing)
INSERT INTO posts (id, user_id, content, visibility, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'Test post: beautiful weather today, perfect for golf! ⛳',
  'public',
  now() - (random() * interval '7 days')
FROM profiles p
WHERE p.user_id LIKE 'test-%'
LIMIT 5;

-- Insert some test availability (for scheduling feature)
INSERT INTO availability (id, user_id, date, is_available, time_slots, notes)
SELECT
  gen_random_uuid(),
  p.id,
  CURRENT_DATE + (n || ' days')::interval,
  true,
  ARRAY['morning', 'afternoon'],
  'Test availability'
FROM profiles p
CROSS JOIN generate_series(1, 7) as n
WHERE p.user_id IN ('test-user-1', 'test-user-2', 'test-user-3')
LIMIT 20;

-- Note: Do NOT insert real matches, likes, or messages
-- These will be generated during AI matching testing
