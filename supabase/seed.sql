-- Supabase Seed Data for GolfMatch
-- This file populates preview branches with test data
-- DO NOT include real production user data!

-- Clean up existing test data (if any)
DELETE FROM profiles WHERE user_id LIKE 'test-%';

-- Insert test golfer profiles for AI matching testing
INSERT INTO profiles (id, user_id, name, age, gender, location, prefecture, golf_skill_level, average_score, bio, is_verified, last_active_at, birth_date)
VALUES
  -- Test users for 2-player matching
  (gen_random_uuid(), 'test-user-1', 'テスト太郎', 28, 'male', '東京都渋谷区', '東京都', '中級者', 95, 'ゴルフ歴3年です。週末ゴルファーです！', true, now(), '1996-01-15'),
  (gen_random_uuid(), 'test-user-2', 'テスト花子', 32, 'female', '東京都新宿区', '東京都', '上級者', 85, 'ゴルフが大好きです。一緒にラウンドしましょう！', true, now(), '1992-05-20'),
  (gen_random_uuid(), 'test-user-3', 'ゴルフ次郎', 35, 'male', '神奈川県横浜市', '神奈川県', '中級者', 92, 'まったりゴルフを楽しんでいます', true, now(), '1989-03-10'),
  (gen_random_uuid(), 'test-user-4', 'スイング三郎', 29, 'male', '東京都世田谷区', '東京都', 'ビギナー', 110, '初心者ですが楽しくプレーしたいです！', true, now(), '1995-08-25'),

  -- Test users for 4-player matching
  (gen_random_uuid(), 'test-user-5', 'プロ山田', 40, 'male', '大阪府大阪市', '大阪府', 'プロ', 72, 'プロゴルファーです。楽しくラウンドしましょう', true, now(), '1984-11-05'),
  (gen_random_uuid(), 'test-user-6', '初心者佐藤', 25, 'female', '大阪府堺市', '大阪府', 'ビギナー', 120, 'ゴルフ始めたばかりです', true, now(), '1999-07-12'),
  (gen_random_uuid(), 'test-user-7', '中級者鈴木', 33, 'male', '愛知県名古屋市', '愛知県', '中級者', 88, 'スコア80台目指してます', true, now(), '1991-02-18'),
  (gen_random_uuid(), 'test-user-8', '上級者田中', 38, 'female', '福岡県福岡市', '福岡県', '上級者', 78, 'シングルプレーヤーです', true, now(), '1986-09-30'),

  -- Additional test users for edge cases
  (gen_random_uuid(), 'test-user-9', 'エッジケース1', 45, 'male', '北海道札幌市', '北海道', '中級者', 95, '遠方からのテストユーザー', true, now(), '1979-04-22'),
  (gen_random_uuid(), 'test-user-10', 'エッジケース2', 22, 'female', '沖縄県那覇市', '沖縄県', 'ビギナー', 115, '若手ゴルファー', true, now(), '2002-12-08');

-- Insert some sample posts from test users (for timeline testing)
INSERT INTO posts (id, user_id, content, visibility, created_at)
SELECT
  gen_random_uuid(),
  p.id,
  'テスト投稿：今日は良い天気でゴルフ日和です！⛳',
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
  'テスト予定'
FROM profiles p
CROSS JOIN generate_series(1, 7) as n
WHERE p.user_id IN ('test-user-1', 'test-user-2', 'test-user-3')
LIMIT 20;

-- Note: Do NOT insert real matches, likes, or messages
-- These will be generated during AI matching testing
