--
-- PostgreSQL database dump
--

\restrict TombzJKlYJsN93KSZK3z8MNzsir1lAXvBSXCtHLxGnf0hLO36Kf3MnnUUc7V5yY

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: kyc_submission_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kyc_submission_status AS ENUM (
    'pending_review',
    'approved',
    'retry',
    'rejected'
);


--
-- Name: profile_kyc_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.profile_kyc_status AS ENUM (
    'not_started',
    'pending_review',
    'approved',
    'retry',
    'rejected'
);


--
-- Name: auto_ban_spam_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_ban_spam_users() RETURNS TABLE(banned_user_id uuid, banned_user_name text, banned_email text, score integer, reasons text[])
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH user_signals AS (
      SELECT
        p.id AS uid,
        p.name AS uname,
        p.user_id AS auth_uid,
        p.created_at AS ucreated,
        (SELECT au.email FROM auth.users au WHERE au.id::text = p.user_id) AS uemail,

        -- S1: Email in blocklist (INSTANT BAN)
        CASE WHEN EXISTS (
          SELECT 1 FROM banned_emails be 
          WHERE be.email = LOWER((SELECT au.email FROM auth.users au WHERE au.id::text = p.user_id))
        ) THEN true ELSE false END AS email_blocklisted,

        -- S2: Duplicate messages sent to 2+ users
        (SELECT COALESCE(max(cnt), 0) FROM (
          SELECT count(DISTINCT receiver_id) AS cnt
          FROM messages m WHERE m.sender_id = p.id AND length(m.text) > 10
          GROUP BY m.text HAVING count(DISTINCT receiver_id) > 1
        ) dupes) AS max_duplicate_messages,

        -- S3: Mass likes in first hour
        (SELECT count(*) FROM user_likes ul
         WHERE ul.liker_user_id = p.id AND ul.type IN ('like', 'super_like')
           AND ul.created_at < p.created_at + interval '1 hour'
        ) AS likes_first_hour,

        -- S4: Empty profile + single photo
        CASE WHEN (p.bio IS NULL OR length(trim(p.bio)) = 0)
              AND array_length(p.profile_pictures, 1) <= 1
        THEN true ELSE false END AS empty_profile,

        -- S5: KYC submitted < 10 min after registration
        CASE WHEN EXISTS (
          SELECT 1 FROM kyc_submissions ks
          WHERE ks.user_id = p.id
            AND ks.created_at < p.created_at + interval '10 minutes'
        ) THEN true ELSE false END AS fast_kyc,

        -- S6: Bot-like swipe speed (avg < 3 sec, 5+ actions)
        CASE WHEN (
          SELECT EXTRACT(EPOCH FROM (max(ul.created_at) - min(ul.created_at))) / GREATEST(count(*) - 1, 1)
          FROM user_likes ul WHERE ul.liker_user_id = p.id
        ) < 3 AND (SELECT count(*) FROM user_likes ul WHERE ul.liker_user_id = p.id) > 5
        THEN true ELSE false END AS rapid_swiping,

        -- S7: LINE solicitation within 24h of registration
        CASE WHEN EXISTS (
          SELECT 1 FROM messages m
          WHERE m.sender_id = p.id
            AND (m.text ILIKE '%LINE%移動%' OR m.text ILIKE '%LINEに%' 
                 OR m.text ILIKE '%ライン交換%' OR m.text ILIKE '%LINE交換%')
            AND m.created_at < p.created_at + interval '24 hours'
        ) THEN true ELSE false END AS line_solicitation,

        -- S8: No golf details filled (score=0, no experience, no skill)
        CASE WHEN (p.average_score IS NULL OR p.average_score = 0)
              AND p.golf_experience IS NULL
              AND p.golf_skill_level IS NULL
              AND p.best_score IS NULL
        THEN true ELSE false END AS no_golf_info

      FROM profiles p
      WHERE p.created_at > now() - interval '7 days'
        AND p.is_banned = false
    )
    SELECT
      us.uid, us.uname, us.auth_uid, us.uemail,
      (
        CASE WHEN us.email_blocklisted THEN 100 ELSE 0 END +
        CASE WHEN us.max_duplicate_messages >= 2 THEN 40 ELSE 0 END +
        CASE WHEN us.likes_first_hour > 20 THEN 25 ELSE 0 END +
        CASE WHEN us.rapid_swiping THEN 20 ELSE 0 END +
        CASE WHEN us.line_solicitation THEN 30 ELSE 0 END +
        CASE WHEN us.empty_profile AND us.no_golf_info THEN 15 ELSE
          CASE WHEN us.empty_profile THEN 10 ELSE 0 END
        END +
        CASE WHEN us.fast_kyc THEN 10 ELSE 0 END
      )::integer AS total_score,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN us.email_blocklisted THEN 'ブロックリスト登録済メール' END,
        CASE WHEN us.max_duplicate_messages >= 2
          THEN '同一メッセージを' || us.max_duplicate_messages || '人に送信' END,
        CASE WHEN us.likes_first_hour > 20
          THEN '登録1時間以内に' || us.likes_first_hour || 'いいね' END,
        CASE WHEN us.rapid_swiping THEN '高速スワイプ（3秒未満/回）' END,
        CASE WHEN us.line_solicitation THEN 'LINE移行を促すメッセージ（24時間以内）' END,
        CASE WHEN us.empty_profile AND us.no_golf_info THEN 'プロフィール・ゴルフ情報なし' 
          WHEN us.empty_profile THEN 'プロフィール未完成' END,
        CASE WHEN us.fast_kyc THEN 'KYC即時提出' END
      ], NULL) AS flag_reasons
    FROM user_signals us
    WHERE (
      CASE WHEN us.email_blocklisted THEN 100 ELSE 0 END +
      CASE WHEN us.max_duplicate_messages >= 2 THEN 40 ELSE 0 END +
      CASE WHEN us.likes_first_hour > 20 THEN 25 ELSE 0 END +
      CASE WHEN us.rapid_swiping THEN 20 ELSE 0 END +
      CASE WHEN us.line_solicitation THEN 30 ELSE 0 END +
      CASE WHEN us.empty_profile AND us.no_golf_info THEN 15 ELSE
        CASE WHEN us.empty_profile THEN 10 ELSE 0 END
      END +
      CASE WHEN us.fast_kyc THEN 10 ELSE 0 END
    ) >= 50
  LOOP
    -- 1. Ban profile
    UPDATE profiles SET
      is_banned = true,
      ban_reason = 'スパム自動検出 (スコア: ' || r.total_score || ')',
      banned_at = now(),
      is_verified = false,
      kyc_status = 'rejected',
      updated_at = now()
    WHERE id = r.uid;

    -- 2. Deactivate matches
    UPDATE matches SET is_active = false
    WHERE (user1_id = r.uid OR user2_id = r.uid) AND is_active = true;

    -- 3. Reject pending KYC
    UPDATE kyc_submissions SET 
      status = 'rejected', rejection_reason = 'スパム自動検出によるBAN'
    WHERE user_id = r.uid AND status IN ('pending_review', 'approved');

    -- 4. Ban auth account
    UPDATE auth.users SET banned_until = '2126-01-01 00:00:00+00'
    WHERE id::text = r.auth_uid;

    -- 5. Add email to blocklist
    IF r.uemail IS NOT NULL THEN
      INSERT INTO banned_emails (email, reason)
      VALUES (LOWER(r.uemail), 'スパム自動検出 (スコア: ' || r.total_score || ')')
      ON CONFLICT (email) DO NOTHING;
    END IF;

    -- 6. Log action
    INSERT INTO moderation_log (target_user_id, action, reason, performed_by, metadata)
    VALUES (r.uid, 'ban', 'スパム自動検出 (スコア: ' || r.total_score || ')', 'auto_spam_bot',
      jsonb_build_object('score', r.total_score, 'reasons', to_jsonb(r.flag_reasons), 'source', 'auto_ban_spam_users'));

    -- 7. Clean up user data (NEW)
    -- Clear chat references first to avoid FK constraint
    UPDATE chats SET last_message_id = NULL
    WHERE user1_id = r.uid OR user2_id = r.uid;
    -- Delete chats
    DELETE FROM chats WHERE user1_id = r.uid OR user2_id = r.uid;
    -- Delete likes
    DELETE FROM user_likes WHERE liker_user_id = r.uid OR liked_user_id = r.uid;
    -- Delete messages
    DELETE FROM messages WHERE sender_id = r.uid OR receiver_id = r.uid;
    -- Delete matches (already deactivated above, now remove)
    DELETE FROM matches WHERE user1_id = r.uid OR user2_id = r.uid;
    -- Delete profile views (足あと)
    DELETE FROM profile_views WHERE viewer_id = r.uid OR viewed_profile_id = r.uid;
    -- Delete notifications
    DELETE FROM notifications WHERE user_id = r.uid;
    -- Delete posts
    DELETE FROM posts WHERE user_id = r.uid;

    banned_user_id := r.uid;
    banned_user_name := r.uname;
    banned_email := r.uemail;
    score := r.total_score;
    reasons := r.flag_reasons;
    RETURN NEXT;
  END LOOP;
END;
$$;


--
-- Name: auto_expire_recruitments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_expire_recruitments() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.recruitments
  SET 
    is_visible = false, 
    status = 'completed', 
    updated_at = now()
  WHERE play_date < CURRENT_DATE 
    AND status IN ('open', 'full');
END;
$$;


--
-- Name: capture_daily_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capture_daily_snapshot() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target_date date;
  day_start timestamptz;
  day_end timestamptz;
  week_start timestamptz;
  month_start timestamptz;
BEGIN
  target_date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
  day_start := target_date AT TIME ZONE 'Asia/Tokyo';
  day_end := (target_date + 1) AT TIME ZONE 'Asia/Tokyo';
  week_start := day_start - interval '7 days';
  month_start := day_start - interval '30 days';

  INSERT INTO daily_snapshots (
    snapshot_date,
    new_users, total_users, complete_profiles,
    likes, super_likes, passes, matches, messages, profile_views, posts, reactions,
    dau, wau, mau, active_24h,
    premium_count, premium_male, premium_female, active_basic, active_permanent, revenue_today,
    deletions,
    male_count, female_count
  )
  VALUES (
    target_date,
    -- New users today
    (SELECT count(*) FROM profiles WHERE created_at >= day_start AND created_at < day_end),
    -- Total users
    (SELECT count(*) FROM profiles),
    -- Complete profiles
    (SELECT count(*) FROM profiles WHERE name IS NOT NULL AND gender IS NOT NULL AND birth_date IS NOT NULL AND prefecture IS NOT NULL AND array_length(profile_pictures, 1) > 0),
    -- Likes today
    (SELECT count(*) FROM user_likes WHERE type = 'like' AND created_at >= day_start AND created_at < day_end),
    -- Super likes today
    (SELECT count(*) FROM user_likes WHERE type = 'super_like' AND created_at >= day_start AND created_at < day_end),
    -- Passes today
    (SELECT count(*) FROM user_likes WHERE type = 'pass' AND created_at >= day_start AND created_at < day_end),
    -- Matches today
    (SELECT count(*) FROM matches WHERE created_at >= day_start AND created_at < day_end),
    -- Messages today
    (SELECT count(*) FROM messages WHERE created_at >= day_start AND created_at < day_end),
    -- Profile views today
    (SELECT count(*) FROM profile_views WHERE viewed_at >= day_start AND viewed_at < day_end),
    -- Posts today
    (SELECT count(*) FROM posts WHERE created_at >= day_start AND created_at < day_end),
    -- Reactions today
    (SELECT count(*) FROM post_reactions WHERE created_at >= day_start AND created_at < day_end),
    -- DAU
    (SELECT count(DISTINCT user_id) FROM (
      SELECT viewer_id as user_id FROM profile_views WHERE viewed_at >= day_start AND viewed_at < day_end
      UNION SELECT sender_id FROM messages WHERE created_at >= day_start AND created_at < day_end
      UNION SELECT liker_user_id FROM user_likes WHERE created_at >= day_start AND created_at < day_end
    ) a),
    -- WAU
    (SELECT count(DISTINCT user_id) FROM (
      SELECT viewer_id as user_id FROM profile_views WHERE viewed_at >= week_start AND viewed_at < day_end
      UNION SELECT sender_id FROM messages WHERE created_at >= week_start AND created_at < day_end
      UNION SELECT liker_user_id FROM user_likes WHERE created_at >= week_start AND created_at < day_end
    ) a),
    -- MAU
    (SELECT count(DISTINCT user_id) FROM (
      SELECT viewer_id as user_id FROM profile_views WHERE viewed_at >= month_start AND viewed_at < day_end
      UNION SELECT sender_id FROM messages WHERE created_at >= month_start AND created_at < day_end
      UNION SELECT liker_user_id FROM user_likes WHERE created_at >= month_start AND created_at < day_end
    ) a),
    -- Active 24h
    (SELECT count(*) FROM profiles WHERE last_active_at >= day_start - interval '24 hours'),
    -- Premium
    (SELECT count(*) FROM profiles WHERE is_premium = true),
    (SELECT count(*) FROM profiles WHERE is_premium = true AND gender = 'male'),
    (SELECT count(*) FROM profiles WHERE is_premium = true AND gender = 'female'),
    (SELECT count(*) FROM memberships WHERE is_active = true AND plan_type = 'basic'),
    (SELECT count(*) FROM memberships WHERE is_active = true AND plan_type = 'permanent'),
    -- Revenue today
    (SELECT coalesce(sum(price), 0) FROM memberships WHERE purchase_date >= day_start AND purchase_date < day_end),
    -- Deletions today
    (SELECT count(*) FROM account_deletions WHERE deleted_at >= day_start AND deleted_at < day_end),
    -- Gender counts
    (SELECT count(*) FROM profiles WHERE gender = 'male'),
    (SELECT count(*) FROM profiles WHERE gender = 'female')
  )
  ON CONFLICT (snapshot_date) DO UPDATE SET
    new_users = EXCLUDED.new_users,
    total_users = EXCLUDED.total_users,
    complete_profiles = EXCLUDED.complete_profiles,
    likes = EXCLUDED.likes,
    super_likes = EXCLUDED.super_likes,
    passes = EXCLUDED.passes,
    matches = EXCLUDED.matches,
    messages = EXCLUDED.messages,
    profile_views = EXCLUDED.profile_views,
    posts = EXCLUDED.posts,
    reactions = EXCLUDED.reactions,
    dau = EXCLUDED.dau,
    wau = EXCLUDED.wau,
    mau = EXCLUDED.mau,
    active_24h = EXCLUDED.active_24h,
    premium_count = EXCLUDED.premium_count,
    premium_male = EXCLUDED.premium_male,
    premium_female = EXCLUDED.premium_female,
    active_basic = EXCLUDED.active_basic,
    active_permanent = EXCLUDED.active_permanent,
    revenue_today = EXCLUDED.revenue_today,
    deletions = EXCLUDED.deletions,
    male_count = EXCLUDED.male_count,
    female_count = EXCLUDED.female_count,
    created_at = now();
END;
$$;


--
-- Name: check_active_membership(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_active_membership(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  has_active_membership boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = p_user_id
      AND is_active = true
      AND (expiration_date IS NULL OR expiration_date > NOW())
  ) INTO has_active_membership;
  
  RETURN has_active_membership;
END;
$$;


--
-- Name: check_and_create_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_create_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  mutual_like_exists BOOLEAN;
  user1 UUID;
  user2 UUID;
BEGIN
  -- Check if mutual like exists
  SELECT EXISTS(
    SELECT 1 FROM public.user_likes
    WHERE liker_user_id = NEW.liked_user_id 
      AND liked_user_id = NEW.liker_user_id
      AND type IN ('like', 'super_like')
      AND is_active = true
  ) INTO mutual_like_exists;

  IF mutual_like_exists AND NEW.type IN ('like', 'super_like') THEN
    -- Ensure consistent ordering for UNIQUE constraint
    IF NEW.liker_user_id < NEW.liked_user_id THEN
      user1 := NEW.liker_user_id;
      user2 := NEW.liked_user_id;
    ELSE
      user1 := NEW.liked_user_id;
      user2 := NEW.liker_user_id;
    END IF;

    -- Create match if not exists with seen flags initialized to false
    INSERT INTO public.matches (user1_id, user2_id, seen_by_user1, seen_by_user2)
    VALUES (user1, user2, false, false)
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: check_email_signup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_email_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_email TEXT;
  v_domain TEXT;
  v_provider TEXT;
  v_allowed_domains TEXT[] := ARRAY[
    'icloud.com',
    'me.com',
    'mac.com',
    'au.com'
  ];
BEGIN
  v_email := lower(NEW.email);
  v_provider := NEW.raw_app_meta_data->>'provider';
  
  IF v_provider = 'email' THEN
    v_domain := split_part(v_email, '@', 2);
    
    IF v_domain = 'line.golfmatch.app' THEN
      RETURN NEW;
    END IF;
    
    IF v_domain LIKE '%.jp' THEN
      RETURN NEW;
    END IF;
    
    IF v_domain = ANY(v_allowed_domains) THEN
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'メールアドレスでの登録はJPドメイン(.jp)のメールのみ対応しています。Gmailの方はGoogleログイン、Apple IDの方はAppleでサインインをご利用ください。'
      USING ERRCODE = 'check_violation';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: check_report_rate_limit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_report_rate_limit(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  report_count integer;
BEGIN
  SELECT COUNT(*) INTO report_count
  FROM reports
  WHERE reporter_id = p_user_id
    AND created_at > NOW() - INTERVAL '1 hour';
  
  RETURN report_count < 5;
END;
$$;


--
-- Name: cleanup_old_messages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_messages() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM messages 
    WHERE created_at < now() - INTERVAL '1 year';
    
    -- Log the cleanup
    INSERT INTO user_activities (user_id, activity_type, metadata)
    VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid, -- System user
        'system_cleanup',
        jsonb_build_object(
            'action', 'cleanup_old_messages',
            'deleted_count', ROW_COUNT,
            'cleanup_date', now()
        )
    );
END;
$$;


--
-- Name: create_chat_on_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_chat_on_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Create a chat for this new match
  INSERT INTO public.chats (
    match_id,
    participants,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    ARRAY[NEW.user1_id, NEW.user2_id],
    NOW(),
    NOW()
  )
  ON CONFLICT (match_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;


--
-- Name: create_like_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_like_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  liker_name TEXT;
  liker_image TEXT;
  like_type_text TEXT;
BEGIN
  -- Skip passes
  IF NEW.type = 'pass' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if type changed to 'like'/'super_like' 
  -- (e.g., pass→like) or if is_active changed to true
  IF TG_OP = 'UPDATE' THEN
    -- Skip if type didn't change and is_active didn't change
    IF OLD.type = NEW.type AND OLD.is_active = NEW.is_active THEN
      RETURN NEW;
    END IF;
    -- Skip if becoming inactive
    IF NEW.is_active = false THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT name, profile_pictures[1]
  INTO liker_name, liker_image
  FROM public.profiles
  WHERE id = NEW.liker_user_id;

  like_type_text := CASE 
    WHEN NEW.type = 'super_like' THEN 'スーパーいいね'
    ELSE 'いいね'
  END;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    from_user_id,
    data,
    is_read
  ) VALUES (
    NEW.liked_user_id,
    'like',
    COALESCE(liker_name, like_type_text),
    COALESCE(liker_name, 'Someone') || 'があなたに' || like_type_text || 'しました',
    NEW.liker_user_id,
    jsonb_build_object('fromUserId', NEW.liker_user_id),
    false
  );

  RETURN NEW;
END;
$$;


--
-- Name: create_match_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_match_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  user1_name TEXT;
  user1_image TEXT;
  user2_name TEXT;
  user2_image TEXT;
BEGIN
  SELECT name, profile_pictures[1]
  INTO user1_name, user1_image
  FROM public.profiles
  WHERE id = NEW.user1_id;

  SELECT name, profile_pictures[1]
  INTO user2_name, user2_image
  FROM public.profiles
  WHERE id = NEW.user2_id;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    from_user_id,
    data,
    is_read
  ) VALUES (
    NEW.user1_id,
    'match',
    'マッチしました！',
    COALESCE(user2_name, 'Someone') || 'とマッチしました！',
    NEW.user2_id,
    jsonb_build_object('matchId', NEW.id, 'fromUserId', NEW.user2_id),
    false
  );

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    from_user_id,
    data,
    is_read
  ) VALUES (
    NEW.user2_id,
    'match',
    'マッチしました！',
    COALESCE(user1_name, 'Someone') || 'とマッチしました！',
    NEW.user1_id,
    jsonb_build_object('matchId', NEW.id, 'fromUserId', NEW.user1_id),
    false
  );

  RETURN NEW;
END;
$$;


--
-- Name: create_match_on_mutual_like(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_match_on_mutual_like() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only proceed if this is a new like (not an update)
    IF TG_OP = 'INSERT' AND NEW.type IN ('like', 'super_like') THEN
        -- Check if there's a mutual like
        IF EXISTS (
            SELECT 1 FROM user_likes 
            WHERE liker_user_id = NEW.liked_user_id 
            AND liked_user_id = NEW.liker_user_id 
            AND type IN ('like', 'super_like')
            AND is_active = true
        ) THEN
            -- Check if match doesn't already exist
            IF NOT EXISTS (
                SELECT 1 FROM matches 
                WHERE (user1_id = NEW.liker_user_id AND user2_id = NEW.liked_user_id)
                OR (user1_id = NEW.liked_user_id AND user2_id = NEW.liker_user_id)
            ) THEN
                -- Create the match
                INSERT INTO matches (user1_id, user2_id, matched_at)
                VALUES (
                    LEAST(NEW.liker_user_id, NEW.liked_user_id),
                    GREATEST(NEW.liker_user_id, NEW.liked_user_id),
                    now()
                );
                
                -- Create a chat for the match
                INSERT INTO chats (match_id, participants)
                SELECT 
                    m.id,
                    ARRAY[NEW.liker_user_id, NEW.liked_user_id]
                FROM matches m
                WHERE (m.user1_id = LEAST(NEW.liker_user_id, NEW.liked_user_id) 
                AND m.user2_id = GREATEST(NEW.liker_user_id, NEW.liked_user_id))
                ORDER BY m.created_at DESC
                LIMIT 1;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: create_message_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_message_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  sender_name TEXT;
  sender_image TEXT;
BEGIN
  -- Get sender info
  SELECT name, profile_pictures[1]
  INTO sender_name, sender_image
  FROM public.profiles
  WHERE id = NEW.sender_id;

  -- Create notification for receiver
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    from_user_id,
    data,
    is_read
  ) VALUES (
    NEW.receiver_id,
    'message',
    COALESCE(sender_name, 'メッセージ'),
    COALESCE(sender_name, 'Someone') || 'からメッセージが届きました',
    NEW.sender_id,
    jsonb_build_object('chatId', NEW.chat_id, 'fromUserId', NEW.sender_id),
    false
  );

  RETURN NEW;
END;
$$;


--
-- Name: create_post_reaction_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_post_reaction_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  post_owner_id UUID;
  reactor_name TEXT;
  reactor_image TEXT;
  existing_notification_id UUID;
BEGIN
  -- Get the post owner
  SELECT user_id INTO post_owner_id
  FROM public.posts
  WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Check if a similar notification already exists (same user, same reactor, same post)
  -- within the last 24 hours to prevent duplicates
  SELECT id INTO existing_notification_id
  FROM public.notifications
  WHERE user_id = post_owner_id
    AND from_user_id = NEW.user_id
    AND type = 'post_reaction'
    AND (data->>'postId')::text = NEW.post_id::text
    AND created_at > NOW() - INTERVAL '24 hours'
  LIMIT 1;

  -- Only create notification if no recent duplicate exists
  IF existing_notification_id IS NULL THEN
    SELECT name, profile_pictures[1]
    INTO reactor_name, reactor_image
    FROM public.profiles
    WHERE id = NEW.user_id;

    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      body,
      from_user_id,
      data,
      is_read
    ) VALUES (
      post_owner_id,
      'post_reaction',
      COALESCE(reactor_name, 'リアクション'),
      COALESCE(reactor_name, 'Someone') || 'があなたの投稿にリアクションしました',
      NEW.user_id,
      jsonb_build_object('postId', NEW.post_id, 'fromUserId', NEW.user_id),
      false
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: create_recruitment_application_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_recruitment_application_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_applicant_name TEXT;
  v_recruitment_title TEXT;
  v_host_id UUID;
BEGIN
  -- Get applicant name
  SELECT name INTO v_applicant_name 
  FROM public.profiles 
  WHERE id = NEW.applicant_id;
  
  -- Get recruitment title and host
  SELECT title, host_id INTO v_recruitment_title, v_host_id 
  FROM public.recruitments 
  WHERE id = NEW.recruitment_id;

  -- Create notification for the host
  INSERT INTO public.notifications (user_id, type, title, body, from_user_id, data)
  VALUES (
    v_host_id,
    'recruitment_application',
    '参加申請',
    COALESCE(v_applicant_name, '名前なし') || 'さんが「' || COALESCE(v_recruitment_title, '募集') || '」に参加申請しました',
    NEW.applicant_id,
    jsonb_build_object(
      'recruitment_id', NEW.recruitment_id,
      'application_id', NEW.id
    )
  );
  
  RETURN NEW;
END;
$$;


--
-- Name: create_recruitment_response_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_recruitment_response_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_recruitment_title TEXT;
  v_host_id UUID;
  v_notification_type TEXT;
  v_notification_title TEXT;
  v_notification_body TEXT;
BEGIN
  -- Only trigger when status changes from pending to approved/rejected
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    -- Get recruitment info
    SELECT title, host_id INTO v_recruitment_title, v_host_id 
    FROM public.recruitments 
    WHERE id = NEW.recruitment_id;

    -- Set notification content based on status
    IF NEW.status = 'approved' THEN
      v_notification_type := 'recruitment_approved';
      v_notification_title := '参加承認';
      v_notification_body := '「' || COALESCE(v_recruitment_title, '募集') || '」への参加が承認されました';
    ELSE
      v_notification_type := 'recruitment_rejected';
      v_notification_title := '参加不承認';
      v_notification_body := '「' || COALESCE(v_recruitment_title, '募集') || '」への参加が承認されませんでした';
    END IF;

    -- Create notification for the applicant
    INSERT INTO public.notifications (user_id, type, title, body, from_user_id, data)
    VALUES (
      NEW.applicant_id,
      v_notification_type,
      v_notification_title,
      v_notification_body,
      v_host_id,
      jsonb_build_object('recruitment_id', NEW.recruitment_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: decrement_post_likes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_post_likes(post_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.posts 
  SET likes_count = GREATEST(likes_count - 1, 0)
  WHERE id = post_id;
END;
$$;


--
-- Name: decrement_post_reactions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_post_reactions(post_id_param uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.posts 
  SET reactions_count = GREATEST(reactions_count - 1, 0)
  WHERE id = post_id_param;
END;
$$;


--
-- Name: delete_user_account(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_account(user_uuid uuid, reason_code text DEFAULT 'unknown'::text, reason_detail text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  profile_uuid UUID;
BEGIN
  -- Get the profile ID for this user
  SELECT id INTO profile_uuid FROM public.profiles WHERE id = user_uuid;
  
  IF profile_uuid IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Snapshot profile into account_deletions BEFORE deleting any data
  INSERT INTO public.account_deletions (user_id, email, name, gender, age, prefecture, is_premium, registered_at, reason_code, reason_detail, days_active)
  SELECT p.id, u.email, p.name, p.gender, p.age, p.prefecture, p.is_premium, p.created_at,
    delete_user_account.reason_code, delete_user_account.reason_detail, EXTRACT(DAY FROM now() - p.created_at)::int
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id::uuid
  WHERE p.id = user_uuid;

  -- 1. Set last_message_id to NULL in chats where user is involved
  UPDATE public.chats 
  SET last_message_id = NULL 
  WHERE user1_id = profile_uuid OR user2_id = profile_uuid;

  -- 2. Delete messages
  DELETE FROM public.messages WHERE sender_id = profile_uuid OR receiver_id = profile_uuid;

  -- 3. Delete chats
  DELETE FROM public.chats WHERE user1_id = profile_uuid OR user2_id = profile_uuid;

  -- 4. Delete matches
  DELETE FROM public.matches WHERE user1_id = profile_uuid OR user2_id = profile_uuid;

  -- 5. Delete user likes
  DELETE FROM public.user_likes WHERE liker_user_id = profile_uuid OR liked_user_id = profile_uuid;

  -- 6. Delete post reactions
  DELETE FROM public.post_reactions WHERE user_id = profile_uuid;

  -- 7. Delete post likes
  DELETE FROM public.post_likes WHERE user_id = profile_uuid;

  -- 8. Delete post comments
  DELETE FROM public.post_comments WHERE user_id = profile_uuid;

  -- 9. Delete post media
  DELETE FROM public.post_media WHERE post_id IN (SELECT id FROM public.posts WHERE user_id = profile_uuid);

  -- 10. Delete posts
  DELETE FROM public.posts WHERE user_id = profile_uuid;

  -- 11. Delete availability
  DELETE FROM public.availability WHERE user_id = profile_uuid;

  -- 12. Delete user activities
  DELETE FROM public.user_activities WHERE user_id = profile_uuid;

  -- 13. Delete profile_views
  DELETE FROM public.profile_views WHERE viewer_id = profile_uuid OR viewed_profile_id = profile_uuid;

  -- 14. Delete notifications
  DELETE FROM public.notifications WHERE user_id = profile_uuid OR from_user_id = profile_uuid;

  -- 15. Delete notification preferences
  DELETE FROM public.notification_preferences WHERE user_id = profile_uuid;

  -- 16. Delete contact replies
  DELETE FROM public.contact_replies WHERE inquiry_id IN (
    SELECT id FROM public.contact_inquiries WHERE user_id = profile_uuid
  );

  -- 17. Delete contact inquiries
  DELETE FROM public.contact_inquiries WHERE user_id = profile_uuid;

  -- 18. Delete KYC submissions
  DELETE FROM public.kyc_submissions WHERE user_id = profile_uuid;

  -- 19. Delete reports
  DELETE FROM public.reports WHERE reporter_id = profile_uuid OR reported_user_id = profile_uuid;

  -- 20. Delete user blocks
  DELETE FROM public.user_blocks WHERE blocker_id = profile_uuid OR blocked_user_id = profile_uuid;

  -- 21. Delete memberships
  DELETE FROM public.memberships WHERE user_id = profile_uuid;

  -- 22. Delete recruitment applications
  DELETE FROM public.recruitment_applications WHERE applicant_id = profile_uuid;

  -- 23. Delete recruitments hosted by user
  DELETE FROM public.recruitments WHERE host_id = profile_uuid;

  -- 24. Delete daily recommendations
  DELETE FROM public.daily_recommendations WHERE user_id = profile_uuid;

  -- 25. Delete dismissed announcements
  DELETE FROM public.dismissed_announcements WHERE user_id = profile_uuid;

  -- 26. Delete user_profiles
  DELETE FROM public.user_profiles WHERE user_id = profile_uuid::text;

  -- 27. Delete the profile
  DELETE FROM public.profiles WHERE id = profile_uuid;

  -- 28. Delete the auth.users record
  DELETE FROM auth.users WHERE id = user_uuid;

END;
$$;


--
-- Name: delete_user_completely(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_completely(target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Delete notifications
  DELETE FROM notifications WHERE user_id = target_user_id OR from_user_id = target_user_id;
  
  -- Delete notification preferences
  DELETE FROM notification_preferences WHERE user_id = target_user_id;
  
  -- Delete profile views
  DELETE FROM profile_views WHERE viewer_id = target_user_id OR viewed_profile_id = target_user_id;
  
  -- Delete user activities
  DELETE FROM user_activities WHERE user_id = target_user_id;
  
  -- Delete availability
  DELETE FROM availability WHERE user_id = target_user_id;
  
  -- Delete post reactions
  DELETE FROM post_reactions WHERE user_id = target_user_id;
  
  -- Delete post likes
  DELETE FROM post_likes WHERE user_id = target_user_id;
  
  -- Delete post comments
  DELETE FROM post_comments WHERE user_id = target_user_id;
  
  -- Delete post media for user's posts
  DELETE FROM post_media WHERE post_id IN (SELECT id FROM posts WHERE user_id = target_user_id);
  
  -- Delete posts
  DELETE FROM posts WHERE user_id = target_user_id;
  
  -- Delete user likes
  DELETE FROM user_likes WHERE liker_user_id = target_user_id OR liked_user_id = target_user_id;
  
  -- Clear last_message_id in chats to break circular reference
  UPDATE chats SET last_message_id = NULL WHERE user1_id = target_user_id OR user2_id = target_user_id;
  
  -- Delete messages
  DELETE FROM messages WHERE sender_id = target_user_id OR receiver_id = target_user_id;
  
  -- Delete chats
  DELETE FROM chats WHERE user1_id = target_user_id OR user2_id = target_user_id;
  
  -- Delete matches
  DELETE FROM matches WHERE user1_id = target_user_id OR user2_id = target_user_id;
  
  -- Delete contact replies for user's inquiries
  DELETE FROM contact_replies WHERE inquiry_id IN (SELECT id FROM contact_inquiries WHERE user_id = target_user_id);
  
  -- Delete contact inquiries
  DELETE FROM contact_inquiries WHERE user_id = target_user_id;
  
  -- Delete memberships
  DELETE FROM memberships WHERE user_id = target_user_id;
  
  -- Delete KYC submissions
  DELETE FROM kyc_submissions WHERE user_id = target_user_id;
  
  -- Delete reports
  DELETE FROM reports WHERE reporter_id = target_user_id OR reported_user_id = target_user_id;
  
  -- Delete user blocks
  DELETE FROM user_blocks WHERE blocker_id = target_user_id OR blocked_user_id = target_user_id;
  
  -- Delete profile
  DELETE FROM profiles WHERE id = target_user_id;
  
  -- Delete from auth.users (this completely removes the user from Supabase Auth)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;


--
-- Name: delete_users_completely(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_users_completely(target_user_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_id UUID;
BEGIN
  FOREACH user_id IN ARRAY target_user_ids
  LOOP
    PERFORM delete_user_completely(user_id);
  END LOOP;
END;
$$;


--
-- Name: detect_suspicious_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.detect_suspicious_users() RETURNS TABLE(user_id uuid, user_name text, gender text, created_at timestamp with time zone, is_banned boolean, is_verified boolean, score integer, reasons text[])
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH user_signals AS (
    SELECT
      p.id AS uid,
      p.name AS uname,
      p.gender AS ugender,
      p.created_at AS ucreated,
      p.is_banned AS ubanned,
      p.is_verified AS uverified,
      -- Signal 1: Likes in first hour after registration (HIGH: >20)
      (SELECT count(*) FROM user_likes ul
       WHERE ul.liker_user_id = p.id
         AND ul.type IN ('like', 'super_like')
         AND ul.created_at < p.created_at + interval '1 hour'
      ) AS likes_first_hour,
      -- Signal 2: Total likes in last 24h
      (SELECT count(*) FROM user_likes ul
       WHERE ul.liker_user_id = p.id
         AND ul.type IN ('like', 'super_like')
         AND ul.created_at > now() - interval '24 hours'
      ) AS likes_last_24h,
      -- Signal 3: Duplicate messages (same text to multiple users) (HIGH: >2)
      (SELECT COALESCE(max(cnt), 0) FROM (
        SELECT count(DISTINCT receiver_id) AS cnt
        FROM messages m
        WHERE m.sender_id = p.id
          AND length(m.text) > 10
        GROUP BY m.text
        HAVING count(DISTINCT receiver_id) > 1
       ) dupes
      ) AS max_duplicate_messages,
      -- Signal 4: Empty bio + single photo (MEDIUM)
      CASE WHEN (p.bio IS NULL OR length(trim(p.bio)) = 0)
            AND array_length(p.profile_pictures, 1) <= 1
      THEN true ELSE false END AS empty_profile,
      -- Signal 5: KYC submitted very quickly after registration (MEDIUM: <10 min)
      CASE WHEN EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.user_id = p.id
          AND ks.created_at < p.created_at + interval '10 minutes'
      ) THEN true ELSE false END AS fast_kyc,
      -- Signal 6: Pass rate < 15% with enough data (MEDIUM)
      (SELECT count(*) FROM user_likes ul
       WHERE ul.liker_user_id = p.id AND ul.type = 'pass'
      ) AS pass_count,
      (SELECT count(*) FROM user_likes ul
       WHERE ul.liker_user_id = p.id
      ) AS total_actions
    FROM profiles p
    WHERE p.created_at > now() - interval '30 days'  -- only recent users
  )
  SELECT
    us.uid,
    us.uname,
    us.ugender,
    us.ucreated,
    us.ubanned,
    us.uverified,
    -- Calculate weighted score
    (
      CASE WHEN us.likes_first_hour > 20 THEN 30 ELSE 0 END +      -- HIGH
      CASE WHEN us.likes_last_24h > 50 THEN 20 ELSE 0 END +        -- HIGH
      CASE WHEN us.max_duplicate_messages > 2 THEN 30 ELSE 0 END +  -- HIGH
      CASE WHEN us.empty_profile THEN 10 ELSE 0 END +               -- MEDIUM
      CASE WHEN us.fast_kyc THEN 10 ELSE 0 END +                    -- MEDIUM
      CASE WHEN us.total_actions > 10
            AND us.pass_count::float / GREATEST(us.total_actions, 1) < 0.15
      THEN 15 ELSE 0 END                                            -- MEDIUM
    )::integer AS score,
    -- Collect reason strings
    ARRAY_REMOVE(ARRAY[
      CASE WHEN us.likes_first_hour > 20
        THEN '登録1時間以内に' || us.likes_first_hour || 'いいね' END,
      CASE WHEN us.likes_last_24h > 50
        THEN '24時間で' || us.likes_last_24h || 'いいね' END,
      CASE WHEN us.max_duplicate_messages > 2
        THEN '同一メッセージを' || us.max_duplicate_messages || '人に送信' END,
      CASE WHEN us.empty_profile
        THEN 'プロフィール未完成（空の自己紹介+写真1枚以下）' END,
      CASE WHEN us.fast_kyc
        THEN 'KYC登録後10分以内に提出' END,
      CASE WHEN us.total_actions > 10
            AND us.pass_count::float / GREATEST(us.total_actions, 1) < 0.15
        THEN 'パス率' || round(us.pass_count::numeric / GREATEST(us.total_actions, 1) * 100) || '%（ほぼ全員にいいね）' END
    ], NULL) AS reasons
  FROM user_signals us
  WHERE (
    CASE WHEN us.likes_first_hour > 20 THEN 30 ELSE 0 END +
    CASE WHEN us.likes_last_24h > 50 THEN 20 ELSE 0 END +
    CASE WHEN us.max_duplicate_messages > 2 THEN 30 ELSE 0 END +
    CASE WHEN us.empty_profile THEN 10 ELSE 0 END +
    CASE WHEN us.fast_kyc THEN 10 ELSE 0 END +
    CASE WHEN us.total_actions > 10
          AND us.pass_count::float / GREATEST(us.total_actions, 1) < 0.15
    THEN 15 ELSE 0 END
  ) >= 10  -- minimum score threshold to appear
  ORDER BY score DESC, us.ucreated DESC;
END;
$$;


--
-- Name: enforce_like_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_like_rate_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  burst_count INTEGER;
  hourly_count INTEGER;
BEGIN
  -- Skip passes
  IF NEW.type = 'pass' THEN
    RETURN NEW;
  END IF;

  -- Check 1: Burst detection (3+ likes in 10 seconds = bot)
  SELECT COUNT(*) INTO burst_count
  FROM user_likes
  WHERE liker_user_id = NEW.liker_user_id
    AND type IN ('like', 'super_like')
    AND created_at > NOW() - INTERVAL '10 seconds';

  IF burst_count >= 2 THEN
    -- Auto-ban the profile
    UPDATE profiles
    SET is_banned = true,
        ban_reason = 'Auto-banned: rapid-fire likes (' || (burst_count + 1) || ' in 10 seconds)',
        banned_at = NOW()
    WHERE id = NEW.liker_user_id
      AND is_banned = false;

    RAISE LOG '[RateLimit] Auto-banned user % for rapid likes (% in 10s)', 
      NEW.liker_user_id, burst_count + 1;

    -- Block the like
    RAISE EXCEPTION 'Account suspended: abnormal activity detected'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check 2: Hourly limit (30 likes/hour)
  SELECT COUNT(*) INTO hourly_count
  FROM user_likes
  WHERE liker_user_id = NEW.liker_user_id
    AND type IN ('like', 'super_like')
    AND created_at > NOW() - INTERVAL '1 hour';

  IF hourly_count >= 30 THEN
    RAISE EXCEPTION 'Like rate limit exceeded: maximum 30 likes per hour'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: generate_post_content_hash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_post_content_hash() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.content_hash := MD5(
    COALESCE(NEW.user_id::text, '') ||
    COALESCE(NEW.content, '') ||
    COALESCE(array_to_string(NEW.images, ','), '') ||
    COALESCE(array_to_string(NEW.videos, ','), '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: get_blocked_user_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_blocked_user_ids(p_user_id uuid) RETURNS SETOF uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT blocked_user_id
  FROM user_blocks
  WHERE blocker_id = p_user_id;
END;
$$;


--
-- Name: get_contact_inquiries_with_replies(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_contact_inquiries_with_replies(p_user_id uuid) RETURNS TABLE(id uuid, user_id uuid, subject text, message text, status text, created_at timestamp with time zone, replied_at timestamp with time zone, updated_at timestamp with time zone, replies jsonb, unread_reply_count bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT 
    ci.id,
    ci.user_id,
    ci.subject,
    ci.message,
    ci.status,
    ci.created_at,
    ci.replied_at,
    ci.updated_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cr.id,
          'inquiry_id', cr.inquiry_id,
          'reply_message', cr.reply_message,
          'from_admin', cr.from_admin,
          'is_read', cr.is_read,
          'created_at', cr.created_at
        ) ORDER BY cr.created_at ASC
      ) FILTER (WHERE cr.id IS NOT NULL),
      '[]'::jsonb
    ) as replies,
    COUNT(cr.id) FILTER (WHERE cr.is_read = false) as unread_reply_count
  FROM public.contact_inquiries ci
  LEFT JOIN public.contact_replies cr ON cr.inquiry_id = ci.id
  WHERE ci.user_id = p_user_id
  GROUP BY ci.id, ci.user_id, ci.subject, ci.message, ci.status, ci.created_at, ci.replied_at, ci.updated_at
  ORDER BY ci.created_at DESC;
$$;


--
-- Name: get_current_profile_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_profile_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT auth.uid();
$$;


--
-- Name: get_daily_dashboard_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_dashboard_stats(target_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb;
  today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo';
  yesterday_start timestamptz := today_start - interval '1 day';
BEGIN
  SELECT jsonb_build_object(
    'today_profile_views', (
      SELECT count(DISTINCT viewer_id) FROM profile_views
      WHERE viewed_profile_id = target_user_id
      AND viewer_id != target_user_id
      AND viewed_at >= today_start
    ),
    'today_likes', (
      SELECT count(*) FROM user_likes
      WHERE liked_user_id = target_user_id
      AND is_active = true
      AND type IN ('like', 'super_like')
      AND created_at >= today_start
    ),
    'today_impressions', (
      SELECT count(*) FROM search_impressions
      WHERE viewed_profile_id = target_user_id
      AND created_at >= today_start
    ),
    'today_post_views', (
      SELECT count(*) FROM post_views pv
      JOIN posts p ON pv.post_id = p.id
      WHERE p.user_id = target_user_id
      AND pv.created_at >= today_start
    ),
    'yesterday_profile_views', (
      SELECT count(DISTINCT viewer_id) FROM profile_views
      WHERE viewed_profile_id = target_user_id
      AND viewer_id != target_user_id
      AND viewed_at >= yesterday_start
      AND viewed_at < today_start
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_daily_notification_stats(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_notification_stats(target_date date) RETURNS TABLE(user_id uuid, impressions bigint, profile_views bigint, likes bigint, push_token text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT 
    p.id AS user_id,
    COALESCE(si.cnt, 0) AS impressions,
    COALESCE(pv.cnt, 0) AS profile_views,
    COALESCE(ul.cnt, 0) AS likes,
    p.push_token
  FROM profiles p
  LEFT JOIN (
    SELECT viewed_profile_id, COUNT(*) AS cnt
    FROM search_impressions
    WHERE created_date = target_date
    GROUP BY viewed_profile_id
  ) si ON si.viewed_profile_id = p.id
  LEFT JOIN (
    SELECT viewed_profile_id, COUNT(DISTINCT viewer_id) AS cnt
    FROM profile_views
    WHERE viewed_at::date = target_date
      AND viewer_id != viewed_profile_id
    GROUP BY viewed_profile_id
  ) pv ON pv.viewed_profile_id = p.id
  LEFT JOIN (
    SELECT liked_user_id, COUNT(*) AS cnt
    FROM user_likes
    WHERE created_at::date = target_date
      AND is_active = true
      AND type IN ('like', 'super_like')
    GROUP BY liked_user_id
  ) ul ON ul.liked_user_id = p.id
  WHERE COALESCE(si.cnt, 0) > 0 
     OR COALESCE(pv.cnt, 0) > 0 
     OR COALESCE(ul.cnt, 0) > 0;
$$;


--
-- Name: get_daily_recommendations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_recommendations(p_user_id uuid) RETURNS TABLE(out_id uuid, out_user_id text, out_legacy_id text, out_name text, out_age integer, out_gender text, out_prefecture text, out_location text, out_golf_skill_level text, out_average_score integer, out_profile_pictures text[], out_bio text, out_is_verified boolean, out_is_premium boolean, out_last_login text, out_created_at text, out_updated_at text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_today date;
  v_existing_count integer;
  v_is_premium boolean;
  v_gender text;
  v_actual_limit integer;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Tokyo')::date;

  SELECT p.is_premium, p.gender INTO v_is_premium, v_gender
  FROM profiles p WHERE p.id = p_user_id;

  IF v_gender = 'female' THEN
    v_actual_limit := 10;
  ELSIF v_is_premium = true THEN
    v_actual_limit := 5;
  ELSE
    v_actual_limit := 3;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM daily_recommendations dr
  WHERE dr.user_id = p_user_id
    AND dr.recommendation_date = v_today;

  IF v_existing_count = 0 THEN
    INSERT INTO daily_recommendations (user_id, recommended_user_id, recommendation_date)
    SELECT p_user_id, r.id, v_today
    FROM get_intelligent_recommendations(p_user_id, v_actual_limit) r
    LIMIT v_actual_limit
    ON CONFLICT (user_id, recommended_user_id, recommendation_date) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.legacy_id, p.name, p.age, p.gender,
    p.prefecture, p.location, p.golf_skill_level, p.average_score,
    p.profile_pictures, p.bio, p.is_verified, p.is_premium,
    p.last_login::text, p.created_at::text, p.updated_at::text
  FROM daily_recommendations dr
  JOIN profiles p ON p.id = dr.recommended_user_id
  WHERE dr.user_id = p_user_id
    AND dr.recommendation_date = v_today
    AND dr.swiped = false
    AND p.is_banned = false  -- Exclude banned users
  ORDER BY dr.created_at ASC;
END;
$$;


--
-- Name: get_dashboard_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_history() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.date), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      d.date::text as date,
      (SELECT count(*) FROM profiles WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date = d.date) as new_users,
      (SELECT count(*) FROM user_likes WHERE type IN ('like','super_like') AND (created_at AT TIME ZONE 'Asia/Tokyo')::date = d.date) as likes,
      (SELECT count(*) FROM matches WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date = d.date) as matches,
      (SELECT count(*) FROM messages WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date = d.date) as messages,
      (SELECT count(*) FROM profile_views WHERE (viewed_at AT TIME ZONE 'Asia/Tokyo')::date = d.date) as profile_views,
      (SELECT count(*) FROM account_deletions WHERE (deleted_at AT TIME ZONE 'Asia/Tokyo')::date = d.date) as deletions
    FROM generate_series(
      (now() AT TIME ZONE 'Asia/Tokyo')::date - 6,
      (now() AT TIME ZONE 'Asia/Tokyo')::date,
      '1 day'::interval
    ) d(date)
  ) t;

  RETURN result;
END;
$$;


--
-- Name: get_dashboard_history(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_history(days_back integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
  yesterday_jst date;
BEGIN
  yesterday_jst := (now() AT TIME ZONE 'Asia/Tokyo')::date - 1;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.snapshot_date), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      ds.snapshot_date::text,
      ds.new_users,
      ds.likes,
      ds.matches,
      ds.messages,
      ds.profile_views,
      ds.deletions,
      ds.dau,
      ds.wau,
      ds.mau,
      ds.posts,
      ds.revenue_today,
      ds.total_users,
      ds.premium_count,
      (SELECT count(*) FROM contact_inquiries ci
       WHERE (ci.created_at AT TIME ZONE 'Asia/Tokyo')::date = ds.snapshot_date
      ) as inquiries
    FROM daily_snapshots ds
    WHERE ds.snapshot_date >= yesterday_jst - (days_back - 1)
      AND ds.snapshot_date <= yesterday_jst
    ORDER BY ds.snapshot_date
  ) t;

  RETURN result;
END;
$$;


--
-- Name: get_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_stats() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb;
  today_start timestamptz;
  yesterday_start timestamptz;
  yesterday_end timestamptz;
  week_start timestamptz;
  month_start timestamptz;
BEGIN
  -- Calculate JST day boundaries
  today_start := date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo';
  yesterday_start := today_start - interval '1 day';
  yesterday_end := today_start;
  week_start := today_start - interval '7 days';
  month_start := today_start - interval '30 days';

  SELECT jsonb_build_object(
    -- ===== DAILY SNAPSHOT =====
    'daily', jsonb_build_object(
      'today', jsonb_build_object(
        'new_users',    (SELECT count(*) FROM profiles WHERE created_at >= today_start),
        'matches',      (SELECT count(*) FROM matches WHERE created_at >= today_start),
        'messages',     (SELECT count(*) FROM messages WHERE created_at >= today_start),
        'likes',        (SELECT count(*) FROM user_likes WHERE type IN ('like','super_like') AND created_at >= today_start),
        'profile_views',(SELECT count(*) FROM profile_views WHERE viewed_at >= today_start),
        'inquiries',    (SELECT count(*) FROM contact_inquiries WHERE created_at >= today_start),
        'deletions',    (SELECT count(*) FROM account_deletions WHERE deleted_at >= today_start),
        'posts',        (SELECT count(*) FROM posts WHERE created_at >= today_start)
      ),
      'yesterday', jsonb_build_object(
        'new_users',    (SELECT count(*) FROM profiles WHERE created_at >= yesterday_start AND created_at < yesterday_end),
        'matches',      (SELECT count(*) FROM matches WHERE created_at >= yesterday_start AND created_at < yesterday_end),
        'messages',     (SELECT count(*) FROM messages WHERE created_at >= yesterday_start AND created_at < yesterday_end),
        'likes',        (SELECT count(*) FROM user_likes WHERE type IN ('like','super_like') AND created_at >= yesterday_start AND created_at < yesterday_end),
        'profile_views',(SELECT count(*) FROM profile_views WHERE viewed_at >= yesterday_start AND viewed_at < yesterday_end),
        'inquiries',    (SELECT count(*) FROM contact_inquiries WHERE created_at >= yesterday_start AND created_at < yesterday_end),
        'deletions',    (SELECT count(*) FROM account_deletions WHERE deleted_at >= yesterday_start AND deleted_at < yesterday_end),
        'posts',        (SELECT count(*) FROM posts WHERE created_at >= yesterday_start AND created_at < yesterday_end)
      )
    ),

    -- ===== CUMULATIVE TOTALS =====
    'totals', jsonb_build_object(
      'total_users',       (SELECT count(*) FROM profiles),
      'complete_profiles', (SELECT count(*) FROM profiles WHERE name IS NOT NULL AND gender IS NOT NULL AND birth_date IS NOT NULL AND prefecture IS NOT NULL AND array_length(profile_pictures, 1) > 0),
      'total_matches',     (SELECT count(*) FROM matches),
      'active_matches',    (SELECT count(*) FROM matches WHERE is_active = true),
      'total_messages',    (SELECT count(*) FROM messages),
      'total_likes',       (SELECT count(*) FROM user_likes WHERE type = 'like'),
      'total_super_likes', (SELECT count(*) FROM user_likes WHERE type = 'super_like'),
      'total_passes',      (SELECT count(*) FROM user_likes WHERE type = 'pass'),
      'total_views',       (SELECT count(*) FROM profile_views),
      'total_posts',       (SELECT count(*) FROM posts),
      'total_reactions',   (SELECT count(*) FROM post_reactions),
      'total_recruitments',(SELECT count(*) FROM recruitments)
    ),

    -- ===== DEMOGRAPHICS =====
    'demographics', jsonb_build_object(
      'gender', (
        SELECT jsonb_build_object(
          'male',   count(*) FILTER (WHERE gender = 'male'),
          'female', count(*) FILTER (WHERE gender = 'female'),
          'other',  count(*) FILTER (WHERE gender = 'other'),
          'unknown',count(*) FILTER (WHERE gender IS NULL)
        ) FROM profiles
      ),
      'age_distribution', (
        SELECT jsonb_build_object(
          '20代', count(*) FILTER (WHERE age >= 20 AND age < 30),
          '30代', count(*) FILTER (WHERE age >= 30 AND age < 40),
          '40代', count(*) FILTER (WHERE age >= 40 AND age < 50),
          '50代', count(*) FILTER (WHERE age >= 50 AND age < 60),
          '60代+', count(*) FILTER (WHERE age >= 60),
          '未設定', count(*) FILTER (WHERE age IS NULL)
        ) FROM profiles
      ),
      'top_prefectures', (
        SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        FROM (
          SELECT prefecture, count(*) as count
          FROM profiles
          WHERE prefecture IS NOT NULL
          GROUP BY prefecture
          ORDER BY count DESC
          LIMIT 10
        ) t
      ),
      'skill_levels', (
        SELECT jsonb_build_object(
          'ビギナー', count(*) FILTER (WHERE golf_skill_level = 'ビギナー'),
          '中級者',   count(*) FILTER (WHERE golf_skill_level = '中級者'),
          '上級者',   count(*) FILTER (WHERE golf_skill_level = '上級者'),
          'プロ',     count(*) FILTER (WHERE golf_skill_level = 'プロ'),
          '未設定',   count(*) FILTER (WHERE golf_skill_level IS NULL)
        ) FROM profiles
      )
    ),

    -- ===== PREMIUM / REVENUE =====
    'premium', jsonb_build_object(
      'total_premium',        (SELECT count(*) FROM profiles WHERE is_premium = true),
      'premium_male',         (SELECT count(*) FROM profiles WHERE is_premium = true AND gender = 'male'),
      'premium_female',       (SELECT count(*) FROM profiles WHERE is_premium = true AND gender = 'female'),
      'premium_rate_pct',     (SELECT round(count(*) FILTER (WHERE is_premium = true) * 100.0 / NULLIF(count(*), 0), 1) FROM profiles),
      'active_basic',         (SELECT count(*) FROM memberships WHERE is_active = true AND plan_type = 'basic'),
      'active_permanent',     (SELECT count(*) FROM memberships WHERE is_active = true AND plan_type = 'permanent'),
      'total_revenue',        (SELECT coalesce(sum(price), 0) FROM memberships),
      'revenue_this_month',   (SELECT coalesce(sum(price), 0) FROM memberships WHERE purchase_date >= date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'),
      'premium_by_source', (
        SELECT jsonb_build_object(
          'revenuecat', count(*) FILTER (WHERE premium_source = 'revenuecat'),
          'manual',     count(*) FILTER (WHERE premium_source = 'manual'),
          'permanent',  count(*) FILTER (WHERE premium_source = 'permanent'),
          'unknown',    count(*) FILTER (WHERE premium_source IS NULL AND is_premium = true)
        ) FROM profiles
      )
    ),

    -- ===== ENGAGEMENT =====
    'engagement', jsonb_build_object(
      'dau', (
        SELECT count(DISTINCT user_id) FROM (
          SELECT viewer_id as user_id FROM profile_views WHERE viewed_at >= today_start
          UNION
          SELECT sender_id FROM messages WHERE created_at >= today_start
          UNION
          SELECT liker_user_id FROM user_likes WHERE created_at >= today_start
        ) active_today
      ),
      'wau', (
        SELECT count(DISTINCT user_id) FROM (
          SELECT viewer_id as user_id FROM profile_views WHERE viewed_at >= week_start
          UNION
          SELECT sender_id FROM messages WHERE created_at >= week_start
          UNION
          SELECT liker_user_id FROM user_likes WHERE created_at >= week_start
        ) active_week
      ),
      'mau', (
        SELECT count(DISTINCT user_id) FROM (
          SELECT viewer_id as user_id FROM profile_views WHERE viewed_at >= month_start
          UNION
          SELECT sender_id FROM messages WHERE created_at >= month_start
          UNION
          SELECT liker_user_id FROM user_likes WHERE created_at >= month_start
        ) active_month
      ),
      'active_24h', (SELECT count(*) FROM profiles WHERE last_active_at >= now() - interval '24 hours'),
      'active_7d',  (SELECT count(*) FROM profiles WHERE last_active_at >= now() - interval '7 days'),
      'inactive_30d',(SELECT count(*) FROM profiles WHERE last_active_at < now() - interval '30 days' OR last_active_at IS NULL),
      'match_rate_pct', (
        SELECT round(
          count(DISTINCT m.id) * 100.0 / NULLIF((SELECT count(*) FROM user_likes WHERE type IN ('like','super_like')), 0)
        , 1)
        FROM matches m
      ),
      'avg_messages_per_match', (
        SELECT round(avg(msg_count)::numeric, 1)
        FROM (
          SELECT c.match_id, count(msg.id) as msg_count
          FROM chats c
          LEFT JOIN messages msg ON msg.chat_id = c.id
          GROUP BY c.match_id
        ) t
      )
    ),

    -- ===== RETENTION / CHURN =====
    'churn', jsonb_build_object(
      'total_deletions',      (SELECT count(*) FROM account_deletions),
      'deletions_this_week',  (SELECT count(*) FROM account_deletions WHERE deleted_at >= week_start),
      'avg_days_active',      (SELECT round(avg(days_active)::numeric, 1) FROM account_deletions WHERE days_active IS NOT NULL),
      'churned_premium',      (SELECT count(*) FROM account_deletions WHERE is_premium = true),
      'deletion_reasons', (
        SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        FROM (
          SELECT reason_code, count(*) as count
          FROM account_deletions
          GROUP BY reason_code
          ORDER BY count DESC
        ) t
      )
    ),

    -- ===== SUPPORT =====
    'support', jsonb_build_object(
      'open_inquiries',    (SELECT count(*) FROM contact_inquiries WHERE status = 'pending'),
      'total_inquiries',   (SELECT count(*) FROM contact_inquiries),
      'pending_kyc',       (SELECT count(*) FROM kyc_submissions WHERE status = 'pending_review'),
      'approved_kyc',      (SELECT count(*) FROM kyc_submissions WHERE status = 'approved'),
      'pending_reports',   (SELECT count(*) FROM reports WHERE status = 'pending'),
      'total_blocks',      (SELECT count(*) FROM user_blocks)
    ),

    -- ===== TIMESTAMP =====
    'generated_at', to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI')
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_feed_posts(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_feed_posts(p_user_id uuid, p_feed_type text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0) RETURNS TABLE(post_id uuid, post_content text, post_images text[], post_videos text[], post_aspect_ratio numeric, post_reactions_count integer, post_created_at timestamp with time zone, user_id uuid, user_name text, user_profile_pictures text[], user_is_verified boolean, user_is_premium boolean, has_reacted boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH feed_users AS (
    -- For 'following', get users that current user has liked
    SELECT liked_user_id as uid
    FROM public.user_likes
    WHERE liker_user_id = p_user_id
      AND type IN ('like', 'super_like')
      AND is_active = true
    UNION
    -- Include current user's own posts for 'following'
    SELECT p_user_id as uid
    WHERE p_feed_type = 'following'
  )
  SELECT 
    p.id as post_id,
    p.content as post_content,
    p.images as post_images,
    p.videos as post_videos,
    p.aspect_ratio as post_aspect_ratio,
    COALESCE(p.reactions_count, 0) as post_reactions_count,
    p.created_at as post_created_at,
    pr.id as user_id,
    pr.name as user_name,
    pr.profile_pictures as user_profile_pictures,
    COALESCE(pr.is_verified, false) as user_is_verified,
    COALESCE(pr.is_premium, false) as user_is_premium,
    EXISTS (
      SELECT 1 FROM public.post_reactions r 
      WHERE r.post_id = p.id AND r.user_id = p_user_id
    ) as has_reacted
  FROM public.posts p
  INNER JOIN public.profiles pr ON p.user_id = pr.id
  WHERE 
    pr.is_banned = false
    AND CASE 
      WHEN p_feed_type = 'following' THEN p.user_id IN (SELECT uid FROM feed_users)
      ELSE p.user_id != p_user_id  -- 'recommended' excludes own posts
    END
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;


--
-- Name: get_footprint_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_footprint_count(target_user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  footprint_count INTEGER;
BEGIN
  -- Count footprints that have not been viewed, excluding banned users
  SELECT COUNT(DISTINCT pv.viewer_id)::INTEGER INTO footprint_count
  FROM profile_views pv
  JOIN profiles p ON p.id = pv.viewer_id
  WHERE pv.viewed_profile_id = target_user_id
    AND pv.viewer_id != target_user_id
    AND pv.viewed = false
    AND p.is_banned = false;

  RETURN footprint_count;
END;
$$;


--
-- Name: get_intelligent_recommendations(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_intelligent_recommendations(p_current_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, user_id text, legacy_id text, name text, age integer, gender text, prefecture text, location text, golf_skill_level text, average_score integer, profile_pictures text[], bio text, is_verified boolean, is_premium boolean, last_login text, created_at text, updated_at text, recommendation_score double precision, score_breakdown jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_prefecture TEXT;
  v_user_skill_level TEXT;
  v_user_avg_score INTEGER;
  v_user_gender TEXT;
  v_date_range_start DATE;
  v_date_range_end DATE;
  v_operator_id UUID := '73d88e5a-83a4-4ec0-8247-a5394db1be94';
BEGIN
  SELECT profiles.prefecture, profiles.golf_skill_level, profiles.average_score, profiles.gender
  INTO v_user_prefecture, v_user_skill_level, v_user_avg_score, v_user_gender
  FROM profiles WHERE profiles.id = p_current_user_id;

  v_date_range_start := CURRENT_DATE;
  v_date_range_end := CURRENT_DATE + INTERVAL '30 days';

  RETURN QUERY
  WITH
  excluded_users AS (
    SELECT liked_user_id AS excluded_id FROM user_likes
    WHERE liker_user_id = p_current_user_id AND is_active = true
    UNION
    SELECT user2_id AS excluded_id FROM matches
    WHERE user1_id = p_current_user_id AND is_active = true
    UNION
    SELECT user1_id AS excluded_id FROM matches
    WHERE user2_id = p_current_user_id AND is_active = true
  ),
  calendar_matches AS (
    SELECT a1.user_id AS profile_id, COUNT(DISTINCT a1.date) AS shared_days_count
    FROM availability a1
    INNER JOIN availability a2 ON a1.date = a2.date AND a1.is_available = true AND a2.is_available = true
    WHERE a2.user_id = p_current_user_id
      AND a1.date BETWEEN v_date_range_start AND v_date_range_end
      AND a1.user_id != p_current_user_id
    GROUP BY a1.user_id
  ),
  candidates AS (
    SELECT
      p.id, p.user_id, p.legacy_id, p.name, p.age, p.gender,
      p.prefecture, p.location, p.golf_skill_level, p.average_score,
      p.profile_pictures, p.bio, p.is_verified, p.is_premium,
      p.last_login, p.created_at, p.updated_at,
      COALESCE(CASE
        WHEN cm.shared_days_count >= 10 THEN 30.0
        WHEN cm.shared_days_count >= 5 THEN 20.0 + (cm.shared_days_count - 5) * 2.0
        WHEN cm.shared_days_count >= 1 THEN 10.0 + (cm.shared_days_count - 1) * 2.5
        ELSE 0.0
      END, 0.0) AS calendar_score,
      CASE
        WHEN p.golf_skill_level = v_user_skill_level THEN 25.0
        WHEN (p.golf_skill_level = 'ビギナー' AND v_user_skill_level = '中級者')
          OR (p.golf_skill_level = '中級者' AND v_user_skill_level = 'ビギナー') THEN 18.0
        WHEN (p.golf_skill_level = '中級者' AND v_user_skill_level = '上級者')
          OR (p.golf_skill_level = '上級者' AND v_user_skill_level = '中級者') THEN 18.0
        WHEN (p.golf_skill_level = '上級者' AND v_user_skill_level = 'プロ')
          OR (p.golf_skill_level = 'プロ' AND v_user_skill_level = '上級者') THEN 18.0
        ELSE 10.0
      END AS skill_score,
      CASE
        WHEN p.average_score IS NULL OR v_user_avg_score IS NULL THEN 10.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 5 THEN 20.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 10 THEN 15.0
        WHEN ABS(p.average_score - v_user_avg_score) <= 20 THEN 10.0
        ELSE 5.0
      END AS score_similarity,
      CASE
        WHEN p.prefecture = v_user_prefecture THEN 15.0
        WHEN (p.prefecture IN ('東京都', '神奈川県', '埼玉県', '千葉県')
          AND v_user_prefecture IN ('東京都', '神奈川県', '埼玉県', '千葉県')) THEN 10.0
        ELSE 5.0
      END AS location_score,
      CASE
        WHEN p.last_login IS NULL THEN 1.0
        WHEN p.last_login >= NOW() - INTERVAL '24 hours' THEN 10.0
        WHEN p.last_login >= NOW() - INTERVAL '7 days' THEN 6.0
        WHEN p.last_login >= NOW() - INTERVAL '30 days' THEN 2.0
        ELSE 0.0
      END AS activity_score,
      (CASE WHEN p.is_verified THEN 4.0 ELSE 0.0 END
        + CASE WHEN array_length(p.profile_pictures, 1) >= 1 THEN 3.0 ELSE 0.0 END
        + CASE WHEN p.bio IS NOT NULL AND length(p.bio) >= 20 THEN 3.0 ELSE 0.0 END
      ) AS profile_quality_score,
      CASE WHEN p.is_premium = true THEN 20.0 ELSE 0.0 END AS premium_score,
      CASE WHEN p.id = v_operator_id THEN 1000.0 ELSE 0.0 END AS operator_score,
      COALESCE(cm.shared_days_count, 0) AS shared_days_count
    FROM profiles p
    LEFT JOIN calendar_matches cm ON cm.profile_id = p.id
    WHERE p.id != p_current_user_id
      AND p.id NOT IN (SELECT excluded_id FROM excluded_users)
      AND p.gender IS NOT NULL
      AND p.birth_date IS NOT NULL
      AND array_length(p.profile_pictures, 1) > 0
      AND p.is_banned = false  -- Exclude banned users
      AND (v_user_gender != 'female' OR p.gender = 'male')
  )
  SELECT c.id, c.user_id, c.legacy_id, c.name, c.age, c.gender,
    c.prefecture, c.location, c.golf_skill_level, c.average_score,
    c.profile_pictures, c.bio, c.is_verified, c.is_premium,
    c.last_login::TEXT, c.created_at::TEXT, c.updated_at::TEXT,
    (c.calendar_score + c.skill_score + c.score_similarity + c.location_score
      + c.activity_score + c.profile_quality_score + c.premium_score + c.operator_score
    )::DOUBLE PRECISION AS recommendation_score,
    jsonb_build_object(
      'calendar_score', c.calendar_score,
      'skill_score', c.skill_score,
      'score_similarity', c.score_similarity,
      'location_score', c.location_score,
      'activity_score', c.activity_score,
      'profile_quality_score', c.profile_quality_score,
      'premium_score', c.premium_score,
      'operator_score', c.operator_score,
      'shared_days_count', c.shared_days_count
    ) AS score_breakdown
  FROM candidates c
  ORDER BY recommendation_score DESC, c.last_login DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;


--
-- Name: get_likes_received_with_profiles(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_likes_received_with_profiles(p_user_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(like_id uuid, like_type text, liked_at timestamp with time zone, liker_id uuid, liker_name text, liker_age integer, liker_prefecture text, liker_profile_pictures text[], liker_is_verified boolean, liker_is_premium boolean, liker_is_online boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT 
    ul.id as like_id,
    ul.type as like_type,
    ul.created_at as liked_at,
    p.id as liker_id,
    p.name as liker_name,
    p.age as liker_age,
    p.prefecture as liker_prefecture,
    p.profile_pictures as liker_profile_pictures,
    COALESCE(p.is_verified, false) as liker_is_verified,
    COALESCE(p.is_premium, false) as liker_is_premium,
    CASE 
      WHEN p.last_active_at IS NOT NULL 
        AND p.last_active_at > NOW() - INTERVAL '5 minutes' 
      THEN true 
      ELSE false 
    END as liker_is_online
  FROM public.user_likes ul
  INNER JOIN public.profiles p ON ul.liker_user_id = p.id
  WHERE ul.liked_user_id = p_user_id
    AND ul.is_active = true
    AND ul.type IN ('like', 'super_like')
    AND p.is_banned = false
  ORDER BY ul.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;


--
-- Name: get_likes_received_with_profiles_v2(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_likes_received_with_profiles_v2(p_user_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(like_id uuid, like_type text, liked_at timestamp with time zone, liker_id uuid, liker_name text, liker_age integer, liker_prefecture text, liker_profile_pictures text[], liker_is_verified boolean, liker_is_premium boolean, liker_is_online boolean, has_liked_back boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    ul.id as like_id,
    ul.type as like_type,
    ul.created_at as liked_at,
    p.id as liker_id,
    p.name as liker_name,
    p.age as liker_age,
    p.prefecture as liker_prefecture,
    p.profile_pictures as liker_profile_pictures,
    COALESCE(p.is_verified, false) as liker_is_verified,
    COALESCE(p.is_premium, false) as liker_is_premium,
    CASE
      WHEN p.last_active_at IS NOT NULL
        AND p.last_active_at > NOW() - INTERVAL '5 minutes'
      THEN true
      ELSE false
    END as liker_is_online,
    -- Check if current user has liked this liker back
    EXISTS(
      SELECT 1 FROM public.user_likes ul2
      WHERE ul2.liker_user_id = p_user_id
        AND ul2.liked_user_id = ul.liker_user_id
        AND ul2.type IN ('like', 'super_like')
        AND ul2.is_active = true
    ) as has_liked_back
  FROM public.user_likes ul
  INNER JOIN public.profiles p ON ul.liker_user_id = p.id
  WHERE ul.liked_user_id = p_user_id
    AND ul.is_active = true
    AND ul.type IN ('like', 'super_like')
    AND p.is_banned = false
  ORDER BY ul.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;


--
-- Name: get_message_previews(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_message_previews(p_user_id uuid) RETURNS TABLE(chat_id uuid, other_user_id uuid, other_user_name text, other_user_image text, last_message text, last_message_type text, last_message_at timestamp with time zone, unread_count bigint, is_online boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT 
    c.id as chat_id,
    CASE 
      WHEN c.user1_id = p_user_id THEN c.user2_id 
      ELSE c.user1_id 
    END as other_user_id,
    CASE 
      WHEN c.user1_id = p_user_id THEN p2.name 
      ELSE p1.name 
    END as other_user_name,
    CASE 
      WHEN c.user1_id = p_user_id THEN p2.profile_pictures[1] 
      ELSE p1.profile_pictures[1] 
    END as other_user_image,
    m.text as last_message,
    m.type as last_message_type,
    m.created_at as last_message_at,
    CASE 
      WHEN c.user1_id = p_user_id THEN COALESCE(c.unread_count_user1, 0)
      ELSE COALESCE(c.unread_count_user2, 0)
    END as unread_count,
    CASE 
      WHEN c.user1_id = p_user_id THEN 
        p2.last_active_at IS NOT NULL AND p2.last_active_at > NOW() - INTERVAL '5 minutes'
      ELSE 
        p1.last_active_at IS NOT NULL AND p1.last_active_at > NOW() - INTERVAL '5 minutes'
    END as is_online
  FROM public.chats c
  LEFT JOIN public.profiles p1 ON c.user1_id = p1.id
  LEFT JOIN public.profiles p2 ON c.user2_id = p2.id
  LEFT JOIN public.messages m ON c.last_message_id = m.id
  WHERE (c.user1_id = p_user_id OR c.user2_id = p_user_id)
    AND CASE
      WHEN c.user1_id = p_user_id THEN p2.is_banned = false
      ELSE p1.is_banned = false
    END
  ORDER BY COALESCE(m.created_at, c.updated_at) DESC;
$$;


--
-- Name: get_mypage_dashboard_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mypage_dashboard_stats(target_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'matches', (
      SELECT count(*) FROM matches 
      WHERE (user1_id = target_user_id OR user2_id = target_user_id) 
      AND is_active = true
    ),
    'likes', (
      SELECT count(*) FROM user_likes 
      WHERE liked_user_id = target_user_id 
      AND is_active = true 
      AND type IN ('like', 'super_like')
    ),
    'profile_views', (
      SELECT count(DISTINCT viewer_id) FROM profile_views 
      WHERE viewed_profile_id = target_user_id 
      AND viewer_id != target_user_id
    ),
    'impressions', (
      SELECT count(*) FROM search_impressions 
      WHERE viewed_profile_id = target_user_id
      AND created_date >= CURRENT_DATE - INTERVAL '90 days'
    ),
    'post_views', (
      SELECT count(*) FROM post_views pv 
      JOIN posts p ON pv.post_id = p.id 
      WHERE p.user_id = target_user_id
    ),
    'recruitment_views', (
      SELECT count(*) FROM recruitment_views rv 
      JOIN recruitments r ON rv.recruitment_id = r.id 
      WHERE r.host_id = target_user_id
    )
  ) INTO result;
  
  RETURN result;
END;
$$;


--
-- Name: get_new_likes_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_new_likes_count(target_user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  last_viewed TIMESTAMPTZ;
  like_count INTEGER;
BEGIN
  -- Get the last time user viewed likes
  SELECT last_likes_viewed_at INTO last_viewed
  FROM profiles
  WHERE id = target_user_id;
  
  -- Count likes that are newer than last viewed (or all if never viewed)
  IF last_viewed IS NULL THEN
    SELECT COUNT(*) INTO like_count
    FROM user_likes ul
    INNER JOIN profiles p ON ul.liker_user_id = p.id
    WHERE ul.liked_user_id = target_user_id
    AND ul.type IN ('like', 'super_like')
    AND p.is_banned = false;
  ELSE
    SELECT COUNT(*) INTO like_count
    FROM user_likes ul
    INNER JOIN profiles p ON ul.liker_user_id = p.id
    WHERE ul.liked_user_id = target_user_id
    AND ul.type IN ('like', 'super_like')
    AND ul.created_at > last_viewed
    AND p.is_banned = false;
  END IF;
  
  RETURN like_count;
END;
$$;


--
-- Name: get_or_create_chat(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_chat(p_user1_id uuid, p_user2_id uuid, p_match_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_chat_id UUID;
  v_normalized_user1 UUID;
  v_normalized_user2 UUID;
  v_existing_match_id UUID;
BEGIN
  -- Normalize user IDs (always smaller ID first for consistency)
  v_normalized_user1 := LEAST(p_user1_id, p_user2_id);
  v_normalized_user2 := GREATEST(p_user1_id, p_user2_id);
  
  -- Try to find existing chat by user1_id/user2_id
  SELECT id, match_id INTO v_chat_id, v_existing_match_id
  FROM chats
  WHERE user1_id = v_normalized_user1 
    AND user2_id = v_normalized_user2
  LIMIT 1;
  
  -- If not found, try to find by participants array
  IF v_chat_id IS NULL THEN
    SELECT id, match_id INTO v_chat_id, v_existing_match_id
    FROM chats
    WHERE v_normalized_user1 = ANY(participants)
      AND v_normalized_user2 = ANY(participants)
    LIMIT 1;
  END IF;
  
  -- If chat exists
  IF v_chat_id IS NOT NULL THEN
    -- If match_id is provided and chat doesn't have one, update it
    IF p_match_id IS NOT NULL AND v_existing_match_id IS NULL THEN
      UPDATE chats 
      SET match_id = p_match_id 
      WHERE id = v_chat_id;
    END IF;
    
    -- Also populate user1_id/user2_id if they're NULL
    UPDATE chats
    SET user1_id = v_normalized_user1,
        user2_id = v_normalized_user2
    WHERE id = v_chat_id
      AND (user1_id IS NULL OR user2_id IS NULL);
    
    RETURN v_chat_id;
  END IF;
  
  -- If match_id not provided, try to find existing match between users
  IF p_match_id IS NULL THEN
    SELECT id INTO p_match_id
    FROM matches
    WHERE (user1_id = v_normalized_user1 AND user2_id = v_normalized_user2)
       OR (user1_id = v_normalized_user2 AND user2_id = v_normalized_user1)
    LIMIT 1;
  END IF;
  
  -- Create new chat with both user1_id/user2_id AND participants
  INSERT INTO chats (
    user1_id, 
    user2_id, 
    participants, 
    match_id
  )
  VALUES (
    v_normalized_user1,
    v_normalized_user2,
    ARRAY[v_normalized_user1, v_normalized_user2],
    p_match_id
  )
  RETURNING id INTO v_chat_id;
  
  RETURN v_chat_id;
EXCEPTION
  WHEN unique_violation THEN
    -- If duplicate, fetch the existing chat and update match_id if needed
    SELECT id, match_id INTO v_chat_id, v_existing_match_id
    FROM chats
    WHERE (user1_id = v_normalized_user1 AND user2_id = v_normalized_user2)
       OR (v_normalized_user1 = ANY(participants) AND v_normalized_user2 = ANY(participants))
    LIMIT 1;
    
    IF p_match_id IS NOT NULL AND v_existing_match_id IS NULL THEN
      UPDATE chats 
      SET match_id = p_match_id 
      WHERE id = v_chat_id;
    END IF;
    
    -- Populate user1_id/user2_id if NULL
    UPDATE chats
    SET user1_id = v_normalized_user1,
        user2_id = v_normalized_user2
    WHERE id = v_chat_id
      AND (user1_id IS NULL OR user2_id IS NULL);
    
    RETURN v_chat_id;
END;
$$;


--
-- Name: get_past_likes_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_past_likes_count(target_user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  count_result INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_result
  FROM public.user_likes ul
  WHERE ul.liker_user_id = target_user_id
    AND ul.type IN ('like', 'super_like')
    AND ul.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_likes reciprocal
      WHERE reciprocal.liker_user_id = ul.liked_user_id
        AND reciprocal.liked_user_id = target_user_id
        AND reciprocal.type IN ('like', 'super_like')
        AND reciprocal.is_active = true
    );
  
  RETURN COALESCE(count_result, 0);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    legacy_id text,
    user_id text NOT NULL,
    name text NOT NULL,
    age integer,
    gender text,
    location text,
    prefecture text,
    golf_skill_level text,
    average_score integer,
    bio text,
    profile_pictures text[] DEFAULT '{}'::text[],
    is_verified boolean DEFAULT false,
    last_login timestamp with time zone,
    blood_type text,
    height text,
    body_type text,
    smoking text,
    favorite_club text,
    personality_type text,
    golf_experience text,
    best_score text,
    transportation text,
    available_days text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    push_token text,
    push_token_updated_at timestamp with time zone,
    last_active_at timestamp with time zone DEFAULT now(),
    kyc_status public.profile_kyc_status,
    kyc_submitted_at timestamp with time zone,
    kyc_verified_at timestamp with time zone,
    is_premium boolean DEFAULT false,
    last_footprints_viewed_at timestamp with time zone,
    last_likes_viewed_at timestamp with time zone,
    birth_date date,
    premium_source text,
    premium_granted_at timestamp with time zone,
    play_prefecture text[],
    received_likes_count integer DEFAULT 0 NOT NULL,
    is_banned boolean DEFAULT false,
    ban_reason text,
    banned_at timestamp with time zone,
    CONSTRAINT profiles_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text]))),
    CONSTRAINT profiles_golf_skill_level_check CHECK ((golf_skill_level = ANY (ARRAY['ビギナー'::text, '中級者'::text, '上級者'::text, 'プロ'::text]))),
    CONSTRAINT profiles_premium_source_check CHECK (((premium_source IS NULL) OR (premium_source = ANY (ARRAY['revenuecat'::text, 'manual'::text, 'permanent'::text]))))
);


--
-- Name: get_profile_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_by_email(p_email text) RETURNS SETOF public.profiles
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT p.*
  FROM auth.users au
  INNER JOIN public.profiles p ON au.id::text = p.user_id
  WHERE au.email = p_email
  LIMIT 1;
$$;


--
-- Name: get_profile_id_by_legacy_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_id_by_legacy_id(legacy_id_param text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  profile_id UUID;
BEGIN
  SELECT id INTO profile_id FROM public.profiles WHERE legacy_id = legacy_id_param;
  RETURN profile_id;
END;
$$;


--
-- Name: get_profile_id_by_user_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_id_by_user_id(user_id_param text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  profile_id UUID;
BEGIN
  SELECT id INTO profile_id FROM public.profiles WHERE user_id = user_id_param;
  RETURN profile_id;
END;
$$;


--
-- Name: get_unmessaged_matches(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unmessaged_matches(p_user_id uuid) RETURNS TABLE(match_id uuid, other_user_id uuid, other_user_name text, other_user_age integer, other_user_prefecture text, other_user_location text, other_user_image text, matched_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT 
    m.id as match_id,
    CASE 
      WHEN m.user1_id = p_user_id THEN m.user2_id 
      ELSE m.user1_id 
    END as other_user_id,
    CASE 
      WHEN m.user1_id = p_user_id THEN p2.name 
      ELSE p1.name 
    END as other_user_name,
    CASE 
      WHEN m.user1_id = p_user_id THEN p2.age 
      ELSE p1.age 
    END as other_user_age,
    CASE 
      WHEN m.user1_id = p_user_id THEN p2.prefecture 
      ELSE p1.prefecture 
    END as other_user_prefecture,
    CASE 
      WHEN m.user1_id = p_user_id THEN p2.location 
      ELSE p1.location 
    END as other_user_location,
    CASE 
      WHEN m.user1_id = p_user_id THEN p2.profile_pictures[1] 
      ELSE p1.profile_pictures[1] 
    END as other_user_image,
    m.matched_at
  FROM public.matches m
  LEFT JOIN public.profiles p1 ON m.user1_id = p1.id
  LEFT JOIN public.profiles p2 ON m.user2_id = p2.id
  LEFT JOIN public.chats c ON c.match_id = m.id
  WHERE 
    m.is_active = true
    AND (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND CASE
      WHEN m.user1_id = p_user_id THEN p2.is_banned = false
      ELSE p1.is_banned = false
    END
    AND (
      -- No chat exists for this match
      c.id IS NULL 
      OR 
      -- Chat exists but has no messages
      NOT EXISTS (
        SELECT 1 FROM public.messages msg 
        WHERE msg.chat_id = c.id
        LIMIT 1
      )
    )
  ORDER BY m.matched_at DESC;
$$;


--
-- Name: get_unread_notification_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unread_notification_count(p_user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.notifications
    WHERE user_id = p_user_id AND is_read = false
  );
END;
$$;


--
-- Name: get_user_activity_stats(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_activity_stats(p_user_ids uuid[]) RETURNS TABLE(user_id uuid, likes_sent bigint, messages_sent bigint, matches bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    p.id AS user_id,
    (SELECT count(*) FROM user_likes ul WHERE ul.liker_user_id = p.id AND ul.type IN ('like', 'super_like')) AS likes_sent,
    (SELECT count(*) FROM messages m WHERE m.sender_id = p.id) AS messages_sent,
    (SELECT count(*) FROM matches mt WHERE (mt.user1_id = p.id OR mt.user2_id = p.id) AND mt.is_active = true) AS matches
  FROM profiles p
  WHERE p.id = ANY(p_user_ids);
$$;


--
-- Name: get_user_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_by_email(p_email text) RETURNS TABLE(id uuid, email text, raw_user_meta_data jsonb)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT id, email::text, raw_user_meta_data
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;
$$;


--
-- Name: get_user_by_line_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_by_line_id(p_line_user_id text) RETURNS TABLE(id uuid, email text, raw_user_meta_data jsonb)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT id, email::text, raw_user_meta_data
  FROM auth.users
  WHERE raw_user_meta_data->>'line_user_id' = p_line_user_id
  LIMIT 1;
$$;


--
-- Name: get_user_chats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_chats(p_user_id uuid) RETURNS TABLE(chat_id uuid, other_user_id uuid, other_user_name text, other_user_image text, last_message text, last_message_type text, last_message_at timestamp with time zone, unread_count integer, is_online boolean, needs_reply boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS chat_id,
    CASE 
      WHEN m.user1_id = p_user_id THEN m.user2_id
      ELSE m.user1_id
    END AS other_user_id,
    CASE 
      WHEN m.user1_id = p_user_id THEN p2.name
      ELSE p1.name
    END AS other_user_name,
    CASE 
      WHEN m.user1_id = p_user_id THEN (p2.profile_pictures[1])
      ELSE (p1.profile_pictures[1])
    END AS other_user_image,
    COALESCE(last_msg.text, '') AS last_message,
    COALESCE(last_msg.type, 'text') AS last_message_type,
    COALESCE(last_msg.created_at, c.created_at) AS last_message_at,
    CASE 
      WHEN last_msg.sender_id IS NOT NULL AND last_msg.sender_id != p_user_id THEN 1
      ELSE 0
    END AS unread_count,
    CASE 
      WHEN m.user1_id = p_user_id THEN 
        (p2.last_active_at IS NOT NULL AND 
         (p2.last_active_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') > 
         (NOW() AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') - INTERVAL '5 minutes')
      ELSE 
        (p1.last_active_at IS NOT NULL AND 
         (p1.last_active_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') > 
         (NOW() AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') - INTERVAL '5 minutes')
    END AS is_online,
    COALESCE(last_msg.sender_id IS NOT NULL AND last_msg.sender_id != p_user_id, false) AS needs_reply
  FROM public.chats c
  INNER JOIN public.matches m ON c.match_id = m.id
  LEFT JOIN public.profiles p1 ON m.user1_id = p1.id
  LEFT JOIN public.profiles p2 ON m.user2_id = p2.id
  LEFT JOIN LATERAL (
    SELECT msg.text, msg.type, msg.created_at, msg.sender_id
    FROM public.messages msg
    WHERE msg.chat_id = c.id
    ORDER BY msg.created_at DESC
    LIMIT 1
  ) last_msg ON true
  WHERE m.is_active = true
    AND (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND last_msg.created_at IS NOT NULL
    AND CASE
      WHEN m.user1_id = p_user_id THEN p2.is_banned = false
      ELSE p1.is_banned = false
    END
  ORDER BY last_message_at DESC NULLS LAST;
END;
$$;


--
-- Name: get_user_footprints(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_footprints(target_user_id uuid) RETURNS TABLE(viewer_id uuid, viewer_name text, viewer_age integer, viewer_birth_date date, viewer_prefecture text, viewer_profile_picture text, viewed_at timestamp with time zone, is_new boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH latest_views AS (
    SELECT DISTINCT ON (pv.viewer_id)
      pv.viewer_id,
      p.name as viewer_name,
      CASE 
        WHEN p.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(current_date, p.birth_date))::int
        ELSE p.age
      END as viewer_age,
      p.birth_date as viewer_birth_date,
      p.prefecture as viewer_prefecture,
      CASE 
        WHEN p.profile_pictures IS NOT NULL AND array_length(p.profile_pictures, 1) > 0 
        THEN p.profile_pictures[1]
        ELSE NULL
      END as viewer_profile_picture,
      pv.viewed_at,
      NOT pv.viewed as is_new
    FROM public.profile_views pv
    JOIN public.profiles p ON p.id = pv.viewer_id
    WHERE pv.viewed_profile_id = target_user_id
      AND p.is_banned = false  -- Exclude banned users from footprints
    ORDER BY pv.viewer_id, pv.viewed_at DESC
  )
  SELECT * FROM latest_views
  ORDER BY viewed_at DESC
  LIMIT 100;
END;
$$;


--
-- Name: get_user_past_likes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_past_likes(target_user_id uuid) RETURNS TABLE(liker_id uuid, liker_name text, liker_age integer, liker_birth_date date, liker_prefecture text, liker_profile_picture text, liked_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ul.liked_user_id as liker_id,
    p.name as liker_name,
    CASE 
      WHEN p.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(current_date, p.birth_date))::int
      ELSE p.age
    END as liker_age,
    p.birth_date as liker_birth_date,
    p.prefecture as liker_prefecture,
    CASE 
      WHEN p.profile_pictures IS NOT NULL AND array_length(p.profile_pictures, 1) > 0 
      THEN p.profile_pictures[1]
      ELSE NULL
    END as liker_profile_picture,
    ul.created_at as liked_at
  FROM public.user_likes ul
  JOIN public.profiles p ON p.id = ul.liked_user_id
  WHERE ul.liker_user_id = target_user_id
    AND ul.type IN ('like', 'super_like')
    AND ul.is_active = true
    AND p.is_banned = false
    AND NOT EXISTS (
      SELECT 1 FROM public.user_likes reciprocal
      WHERE reciprocal.liker_user_id = ul.liked_user_id
        AND reciprocal.liked_user_id = target_user_id
        AND reciprocal.type IN ('like', 'super_like')
        AND reciprocal.is_active = true
    )
  ORDER BY ul.created_at DESC
  LIMIT 100;
END;
$$;


--
-- Name: get_users_by_ids(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_users_by_ids(p_user_ids uuid[]) RETURNS TABLE(id uuid, legacy_id text, user_id text, name text, age integer, gender text, location text, prefecture text, golf_skill_level text, average_score integer, bio text, profile_pictures text[], is_verified boolean, is_premium boolean, last_login timestamp with time zone, last_active_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT 
    p.id,
    p.legacy_id,
    p.user_id,
    p.name,
    p.age,
    p.gender,
    p.location,
    p.prefecture,
    p.golf_skill_level,
    p.average_score,
    p.bio,
    p.profile_pictures,
    p.is_verified,
    p.is_premium,
    p.last_login,
    p.last_active_at,
    p.created_at
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND p.is_banned = false;
$$;


--
-- Name: get_users_online_status(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_users_online_status(p_user_ids uuid[]) RETURNS TABLE(user_id uuid, is_online boolean, last_active_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT 
    p.id as user_id,
    CASE 
      WHEN p.last_active_at IS NOT NULL 
        AND p.last_active_at > NOW() - INTERVAL '5 minutes' 
      THEN true 
      ELSE false 
    END as is_online,
    p.last_active_at
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND p.is_banned = false;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  blocked_domain text;
  email_domain text;
  signup_provider text;
BEGIN
  -- Check banned_emails (exact match)
  IF EXISTS (SELECT 1 FROM public.banned_emails WHERE email = NEW.email) THEN
    RAISE EXCEPTION 'このメールアドレスでは登録できません。';
  END IF;

  -- Check blocked_domains
  email_domain := split_part(NEW.email, '@', 2);
  SELECT d.domain INTO blocked_domain
  FROM public.app_config ac,
       jsonb_array_elements_text(ac.value->'domains') AS d(domain)
  WHERE ac.key = 'blocked_domains'
    AND d.domain = email_domain
  LIMIT 1;

  IF blocked_domain IS NOT NULL THEN
    RAISE EXCEPTION 'このメールドメインは登録に使用できません。';
  END IF;

  -- Get signup provider
  signup_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');

  -- Block Gmail for email/password registration (Google OAuth is still allowed)
  IF signup_provider = 'email' AND email_domain = 'gmail.com' THEN
    RAISE EXCEPTION 'Gmailでのメール登録はできません。Googleアカウントでログインしてください。';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (id, user_id, name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.id::text,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1),
      'ユーザー'
    ),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;


--
-- Name: increment_post_likes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_post_likes(post_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.posts 
  SET likes_count = likes_count + 1 
  WHERE id = post_id;
END;
$$;


--
-- Name: increment_post_reactions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_post_reactions(post_id_param uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.posts 
  SET reactions_count = reactions_count + 1 
  WHERE id = post_id_param;
END;
$$;


--
-- Name: is_current_user_banned(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_current_user_banned() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (SELECT is_banned FROM profiles WHERE id = auth.uid()),
    false
  );
$$;


--
-- Name: is_disposable_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_disposable_email(p_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_domain TEXT;
  v_parts TEXT[];
  v_check TEXT;
  i INTEGER;
BEGIN
  -- Extract domain from email
  v_domain := lower(split_part(p_email, '@', 2));
  
  -- Check exact domain match
  IF EXISTS (SELECT 1 FROM disposable_email_domains WHERE domain = v_domain) THEN
    RETURN true;
  END IF;
  
  -- Check parent domains (e.g., rrrv.rehearsalk.com → rehearsalk.com)
  v_parts := string_to_array(v_domain, '.');
  IF array_length(v_parts, 1) > 2 THEN
    FOR i IN 2..array_length(v_parts, 1) - 1 LOOP
      v_check := array_to_string(v_parts[i:], '.');
      IF EXISTS (SELECT 1 FROM disposable_email_domains WHERE domain = v_check) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  
  RETURN false;
END;
$$;


--
-- Name: is_user_blocked(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_blocked(p_blocker_id uuid, p_blocked_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_blocks
    WHERE blocker_id = p_blocker_id
      AND blocked_user_id = p_blocked_user_id
  );
END;
$$;


--
-- Name: mark_all_notifications_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_all_notifications_read(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = p_user_id AND is_read = false;
END;
$$;


--
-- Name: mark_footprints_viewed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_footprints_viewed(target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Mark all footprint rows as viewed for this user
  UPDATE profile_views
  SET viewed = true
  WHERE viewed_profile_id = target_user_id
    AND viewed = false;
    
  -- Also update the timestamp on profiles (keep for backwards compat)
  UPDATE profiles
  SET last_footprints_viewed_at = NOW()
  WHERE id = target_user_id;
END;
$$;


--
-- Name: mark_likes_viewed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_likes_viewed(target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE profiles
  SET last_likes_viewed_at = NOW()
  WHERE id = target_user_id;
END;
$$;


--
-- Name: mark_recommendation_swiped(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_recommendation_swiped(p_user_id uuid, p_recommended_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.daily_recommendations
  SET swiped = true
  WHERE user_id = p_user_id
    AND recommended_user_id = p_recommended_user_id
    AND recommendation_date = (now() AT TIME ZONE 'Asia/Tokyo')::date;
END;
$$;


--
-- Name: mark_single_footprint_viewed(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_single_footprint_viewed(target_user_id uuid, viewer_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE profile_views
  SET viewed = true
  WHERE viewed_profile_id = target_user_id
    AND viewer_id = viewer_user_id;
END;
$$;


--
-- Name: refresh_profile_ages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_profile_ages() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE profiles 
  SET age = EXTRACT(YEAR FROM age(current_date, birth_date))::int
  WHERE birth_date IS NOT NULL 
    AND age != EXTRACT(YEAR FROM age(current_date, birth_date))::int;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;


--
-- Name: reset_chat_unread_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_chat_unread_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_read = TRUE AND OLD.is_read = FALSE THEN
    UPDATE chats
    SET 
      unread_count_user1 = CASE 
        WHEN user1_id = NEW.receiver_id THEN GREATEST(0, unread_count_user1 - 1)
        ELSE unread_count_user1 
      END,
      unread_count_user2 = CASE 
        WHEN user2_id = NEW.receiver_id THEN GREATEST(0, unread_count_user2 - 1)
        ELSE unread_count_user2 
      END
    WHERE id = NEW.chat_id;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: send_daily_impression_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_daily_impression_notifications() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  r RECORD;
  yesterday DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' - INTERVAL '1 day')::date;
BEGIN
  -- For each user who received impressions yesterday (JST)
  FOR r IN
    SELECT 
      si.viewed_profile_id AS user_id,
      COUNT(*) AS impression_count
    FROM search_impressions si
    WHERE si.created_date = yesterday
    GROUP BY si.viewed_profile_id
    HAVING COUNT(*) > 0
  LOOP
    -- Insert notification (skip if duplicate for same day)
    INSERT INTO notifications (user_id, type, title, body, data, is_read)
    VALUES (
      r.user_id,
      'system',
      '昨日のアクティビティ',
      '昨日、あなたのプロフィールが' || r.impression_count || '回検索結果に表示されました！',
      jsonb_build_object('screen', 'Main'),
      false
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;


--
-- Name: send_push_notification_on_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_push_notification_on_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Skip if type is not a pushable notification
  IF NEW.type NOT IN (
    'like',
    'match',
    'message',
    'post_reaction',
    'recruitment_application',
    'recruitment_approved',
    'recruitment_rejected',
    'kyc_approved',
    'kyc_rejected'
  ) THEN
    RETURN NEW;
  END IF;

  -- Call the Edge Function asynchronously via pg_net
  PERFORM net.http_post(
    url := 'https://rriwpoqhbgvprbhomckk.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'type', NEW.type,
        'title', NEW.title,
        'body', NEW.body,
        'from_user_id', NEW.from_user_id,
        'data', NEW.data
      )
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: set_default_last_active_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_default_last_active_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If last_active_at is null, set it to created_at or current timestamp
  IF NEW.last_active_at IS NULL THEN
    NEW.last_active_at := COALESCE(NEW.created_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_is_verified_with_kyc_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_is_verified_with_kyc_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If kyc_status is being set to 'approved', set is_verified = true
  IF NEW.kyc_status = 'approved' THEN
    NEW.is_verified := true;
  -- If kyc_status is being changed from 'approved' to something else, set is_verified = false
  ELSIF OLD.kyc_status = 'approved' AND NEW.kyc_status != 'approved' THEN
    NEW.is_verified := false;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: sync_kyc_status_to_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_kyc_status_to_profile() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Update the profile's kyc_status when submission status changes
  UPDATE profiles
  SET 
    kyc_status = NEW.status::text::profile_kyc_status,
    kyc_verified_at = CASE 
      WHEN NEW.status = 'approved' THEN COALESCE(NEW.verification_date, now())
      WHEN NEW.status IN ('rejected', 'retry') THEN NULL  -- Clear verification date if rejected/retry
      ELSE kyc_verified_at
    END,
    is_verified = CASE 
      WHEN NEW.status = 'approved' THEN true
      ELSE false  -- Remove verification badge for all other statuses
    END,
    updated_at = now()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$;


--
-- Name: sync_profile_premium_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_profile_premium_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Update the profile's is_premium status based on active membership
  UPDATE profiles
  SET is_premium = check_active_membership(COALESCE(NEW.user_id, OLD.user_id))
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: track_profile_view(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_profile_view(p_viewer_id uuid, p_viewed_profile_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  last_view_time timestamptz;
BEGIN
  -- Don't track self-views
  IF p_viewer_id = p_viewed_profile_id THEN
    RETURN FALSE;
  END IF;

  -- Check the existing row's timestamp
  SELECT viewed_at INTO last_view_time
  FROM public.profile_views
  WHERE viewer_id = p_viewer_id
    AND viewed_profile_id = p_viewed_profile_id;

  -- If a recent view exists (within 24 hours), skip
  IF last_view_time IS NOT NULL AND last_view_time > NOW() - INTERVAL '24 hours' THEN
    RETURN FALSE;
  END IF;

  -- Upsert: insert new row or update existing one
  INSERT INTO public.profile_views (viewer_id, viewed_profile_id, viewed_at, viewed)
  VALUES (p_viewer_id, p_viewed_profile_id, NOW(), false)
  ON CONFLICT (viewer_id, viewed_profile_id)
  DO UPDATE SET viewed_at = NOW(), viewed = false;

  RETURN TRUE;
END;
$$;


--
-- Name: update_blog_posts_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_blog_posts_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_chat_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_last_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE chats
  SET 
    last_message_id = NEW.id,
    last_message_at = NEW.created_at,
    updated_at = NEW.created_at,
    -- Increment unread count for receiver
    unread_count_user1 = CASE 
      WHEN user1_id = NEW.receiver_id THEN unread_count_user1 + 1 
      ELSE unread_count_user1 
    END,
    unread_count_user2 = CASE 
      WHEN user2_id = NEW.receiver_id THEN unread_count_user2 + 1 
      ELSE unread_count_user2 
    END
  WHERE id = NEW.chat_id;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_chat_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_on_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.chats 
  SET updated_at = NOW() 
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_chat_unread_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_unread_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- On new message, increment unread count for receiver
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chats
    SET 
      last_message_id = NEW.id,
      last_message_at = NEW.created_at,
      unread_count_user1 = CASE 
        WHEN user1_id = NEW.receiver_id THEN COALESCE(unread_count_user1, 0) + 1
        ELSE unread_count_user1
      END,
      unread_count_user2 = CASE 
        WHEN user2_id = NEW.receiver_id THEN COALESCE(unread_count_user2, 0) + 1
        ELSE unread_count_user2
      END,
      updated_at = NOW()
    WHERE id = NEW.chat_id;
  END IF;

  -- On message read, update unread count
  IF TG_OP = 'UPDATE' AND OLD.is_read = false AND NEW.is_read = true THEN
    UPDATE public.chats
    SET 
      unread_count_user1 = CASE 
        WHEN user1_id = NEW.receiver_id THEN GREATEST(0, COALESCE(unread_count_user1, 0) - 1)
        ELSE unread_count_user1
      END,
      unread_count_user2 = CASE 
        WHEN user2_id = NEW.receiver_id THEN GREATEST(0, COALESCE(unread_count_user2, 0) - 1)
        ELSE unread_count_user2
      END
    WHERE id = NEW.chat_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_kyc_submissions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_kyc_submissions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_notification_preferences_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notification_preferences_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_post_reactions_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_post_reactions_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET reactions_count = COALESCE(reactions_count, 0) + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET reactions_count = GREATEST(0, COALESCE(reactions_count, 0) - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_received_likes_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_received_likes_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active = true AND NEW.type = 'like' THEN
      UPDATE public.profiles
      SET received_likes_count = received_likes_count + 1
      WHERE id = NEW.liked_user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle activation/deactivation
    IF OLD.is_active = true AND NEW.is_active = false AND OLD.type = 'like' THEN
      UPDATE public.profiles
      SET received_likes_count = GREATEST(received_likes_count - 1, 0)
      WHERE id = NEW.liked_user_id;
    ELSIF OLD.is_active = false AND NEW.is_active = true AND NEW.type = 'like' THEN
      UPDATE public.profiles
      SET received_likes_count = received_likes_count + 1
      WHERE id = NEW.liked_user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_active = true AND OLD.type = 'like' THEN
      UPDATE public.profiles
      SET received_likes_count = GREATEST(received_likes_count - 1, 0)
      WHERE id = OLD.liked_user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_recruitment_filled_slots(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_recruitment_filled_slots() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- When application is approved, increment filled_slots
  IF (OLD.status IS DISTINCT FROM 'approved') AND NEW.status = 'approved' THEN
    UPDATE public.recruitments
    SET 
      filled_slots = filled_slots + 1,
      status = CASE WHEN filled_slots + 1 >= total_slots THEN 'full' ELSE status END,
      updated_at = now()
    WHERE id = NEW.recruitment_id;
  
  -- When approved application is changed to something else, decrement filled_slots
  ELSIF OLD.status = 'approved' AND (NEW.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.recruitments
    SET 
      filled_slots = GREATEST(0, filled_slots - 1),
      status = CASE WHEN status = 'full' THEN 'open' ELSE status END,
      updated_at = now()
    WHERE id = NEW.recruitment_id;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_recruitment_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_recruitment_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: validate_match_mutual_likes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_match_mutual_likes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Ensure user1 has an active like/super_like towards user2
  IF NOT EXISTS (
    SELECT 1 FROM user_likes
    WHERE liker_user_id = NEW.user1_id
      AND liked_user_id = NEW.user2_id
      AND type IN ('like', 'super_like')
      AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  -- Ensure user2 has an active like/super_like towards user1
  IF NOT EXISTS (
    SELECT 1 FROM user_likes
    WHERE liker_user_id = NEW.user2_id
      AND liked_user_id = NEW.user1_id
      AND type IN ('like', 'super_like')
      AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: account_deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text,
    name text,
    gender text,
    age integer,
    prefecture text,
    is_premium boolean DEFAULT false,
    registered_at timestamp with time zone,
    deleted_at timestamp with time zone DEFAULT now(),
    reason_code text NOT NULL,
    reason_detail text,
    days_active integer
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text,
    image_url text,
    cta_text text DEFAULT '詳しく見る'::text,
    cta_url text,
    cta_screen text,
    priority integer DEFAULT 0,
    start_at timestamp with time zone DEFAULT now() NOT NULL,
    end_at timestamp with time zone,
    target_gender text,
    target_premium boolean,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    is_available boolean DEFAULT true,
    time_slots text[] DEFAULT '{}'::text[],
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: banned_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banned_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason text,
    banned_at timestamp with time zone DEFAULT now()
);


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    excerpt text,
    content text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    category text DEFAULT 'お知らせ'::text NOT NULL,
    author text DEFAULT 'GolfMatch編集部'::text NOT NULL,
    reading_time integer DEFAULT 5,
    cover_image text,
    is_featured boolean DEFAULT false,
    tags text[] DEFAULT '{}'::text[],
    meta_title text,
    meta_description text,
    og_image text,
    canonical_url text,
    focus_keyword text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    CONSTRAINT blog_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    match_id uuid,
    participants uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user1_id uuid,
    user2_id uuid,
    last_message_id uuid,
    last_message_at timestamp with time zone,
    unread_count_user1 integer DEFAULT 0,
    unread_count_user2 integer DEFAULT 0
);


--
-- Name: contact_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_inquiries (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    replied_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contact_inquiries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'replied'::text, 'closed'::text])))
);


--
-- Name: contact_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_replies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    inquiry_id uuid NOT NULL,
    reply_message text NOT NULL,
    from_admin boolean DEFAULT true NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recommended_user_id uuid NOT NULL,
    recommendation_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    swiped boolean DEFAULT false NOT NULL
);


--
-- Name: daily_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_date date NOT NULL,
    new_users integer DEFAULT 0 NOT NULL,
    total_users integer DEFAULT 0 NOT NULL,
    complete_profiles integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    super_likes integer DEFAULT 0 NOT NULL,
    passes integer DEFAULT 0 NOT NULL,
    matches integer DEFAULT 0 NOT NULL,
    messages integer DEFAULT 0 NOT NULL,
    profile_views integer DEFAULT 0 NOT NULL,
    posts integer DEFAULT 0 NOT NULL,
    reactions integer DEFAULT 0 NOT NULL,
    dau integer DEFAULT 0 NOT NULL,
    wau integer DEFAULT 0 NOT NULL,
    mau integer DEFAULT 0 NOT NULL,
    active_24h integer DEFAULT 0 NOT NULL,
    premium_count integer DEFAULT 0 NOT NULL,
    premium_male integer DEFAULT 0 NOT NULL,
    premium_female integer DEFAULT 0 NOT NULL,
    active_basic integer DEFAULT 0 NOT NULL,
    active_permanent integer DEFAULT 0 NOT NULL,
    revenue_today integer DEFAULT 0 NOT NULL,
    deletions integer DEFAULT 0 NOT NULL,
    male_count integer DEFAULT 0 NOT NULL,
    female_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dismissed_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dismissed_announcements (
    user_id uuid NOT NULL,
    announcement_id uuid NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now()
);


--
-- Name: disposable_email_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disposable_email_domains (
    domain text NOT NULL
);


--
-- Name: golf_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golf_courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gora_course_id text,
    name text NOT NULL,
    name_kana text,
    prefecture text NOT NULL,
    address text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    image_url text,
    evaluation numeric(2,1),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reserve_url text
);


--
-- Name: kyc_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    id_image_url text NOT NULL,
    selfie_image_url text NOT NULL,
    id_selfie_image_url text NOT NULL,
    status public.kyc_submission_status NOT NULL,
    submission_date timestamp with time zone DEFAULT now() NOT NULL,
    verification_date timestamp with time zone,
    rejection_reason text,
    retry_count integer DEFAULT 0 NOT NULL,
    reviewed_by_admin_id uuid,
    review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id_back_image_url text,
    golf_photo_url text
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user1_id uuid NOT NULL,
    user2_id uuid NOT NULL,
    matched_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    seen_by_user1 boolean DEFAULT false,
    seen_by_user2 boolean DEFAULT false,
    CONSTRAINT matches_check CHECK ((user1_id < user2_id))
);

ALTER TABLE ONLY public.matches REPLICA IDENTITY FULL;


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_type text NOT NULL,
    price integer NOT NULL,
    purchase_date timestamp with time zone DEFAULT now() NOT NULL,
    expiration_date timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    store_transaction_id text,
    platform text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT memberships_plan_type_check CHECK ((plan_type = ANY (ARRAY['basic'::text, 'permanent'::text]))),
    CONSTRAINT memberships_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    chat_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    text text NOT NULL,
    type text DEFAULT 'text'::text,
    image_uri text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    video_uri text,
    attachment_metadata jsonb DEFAULT '{}'::jsonb,
    attachment_path text,
    attachment_thumbnail text,
    attachment_size bigint,
    attachment_mime_type text,
    attachment_duration integer,
    CONSTRAINT messages_type_check CHECK ((type = ANY (ARRAY['text'::text, 'image'::text, 'emoji'::text, 'video'::text])))
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: moderation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    action text NOT NULL,
    reason text,
    performed_by text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    messages_enabled boolean DEFAULT true,
    likes_enabled boolean DEFAULT true,
    matches_enabled boolean DEFAULT true,
    post_reactions_enabled boolean DEFAULT true,
    push_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    from_user_id uuid,
    data jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    push_sent_at timestamp with time zone,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['message'::text, 'like'::text, 'match'::text, 'post_reaction'::text, 'recruitment_application'::text, 'recruitment_approved'::text, 'recruitment_rejected'::text, 'system'::text])))
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


--
-- Name: post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    parent_id uuid
);


--
-- Name: post_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text DEFAULT 'like'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT post_likes_type_check CHECK ((type = ANY (ARRAY['like'::text, 'super_like'::text])))
);


--
-- Name: post_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    media_type text NOT NULL,
    file_path text NOT NULL,
    thumbnail_path text,
    width integer,
    height integer,
    duration integer,
    file_size bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT post_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])))
);


--
-- Name: post_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction_type text DEFAULT 'nice'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT post_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['nice'::text, 'good_job'::text, 'helpful'::text, 'inspiring'::text])))
);

ALTER TABLE ONLY public.post_reactions REPLICA IDENTITY FULL;


--
-- Name: post_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    viewer_id uuid NOT NULL,
    post_id uuid NOT NULL,
    created_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    user_id uuid NOT NULL,
    content text NOT NULL,
    images text[] DEFAULT '{}'::text[],
    videos text[] DEFAULT '{}'::text[],
    likes_count integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    visibility text DEFAULT 'public'::text,
    reactions_count integer DEFAULT 0,
    aspect_ratio numeric(4,3) DEFAULT NULL::numeric,
    content_hash text,
    CONSTRAINT posts_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'followers'::text])))
);


--
-- Name: profile_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    viewer_id uuid NOT NULL,
    viewed_profile_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    viewed boolean DEFAULT false,
    CONSTRAINT no_self_views CHECK ((viewer_id <> viewed_profile_id))
);

ALTER TABLE ONLY public.profile_views REPLICA IDENTITY FULL;


--
-- Name: recruitment_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recruitment_id uuid NOT NULL,
    applicant_id uuid NOT NULL,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    host_response_message text,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT recruitment_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);


--
-- Name: recruitment_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    viewer_id uuid NOT NULL,
    recruitment_id uuid NOT NULL,
    created_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recruitments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    play_date date NOT NULL,
    tee_time time without time zone,
    golf_course_id uuid,
    golf_course_name text NOT NULL,
    golf_course_location text,
    prefecture text,
    course_type text DEFAULT 'THROUGH'::text,
    total_slots integer DEFAULT 3 NOT NULL,
    filled_slots integer DEFAULT 0 NOT NULL,
    gender_preference text DEFAULT 'any'::text,
    min_skill_level text,
    max_skill_level text,
    estimated_cost text,
    additional_notes text,
    status text DEFAULT 'open'::text NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT recruitments_course_type_check CHECK ((course_type = ANY (ARRAY['OUT'::text, 'IN'::text, 'THROUGH'::text]))),
    CONSTRAINT recruitments_filled_slots_check CHECK ((filled_slots >= 0)),
    CONSTRAINT recruitments_gender_preference_check CHECK ((gender_preference = ANY (ARRAY['male'::text, 'female'::text, 'any'::text]))),
    CONSTRAINT recruitments_max_skill_level_check CHECK ((max_skill_level = ANY (ARRAY['ビギナー'::text, '中級者'::text, '上級者'::text, 'プロ'::text]))),
    CONSTRAINT recruitments_min_skill_level_check CHECK ((min_skill_level = ANY (ARRAY['ビギナー'::text, '中級者'::text, '上級者'::text, 'プロ'::text]))),
    CONSTRAINT recruitments_status_check CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'closed'::text, 'cancelled'::text, 'completed'::text]))),
    CONSTRAINT recruitments_total_slots_check CHECK (((total_slots >= 1) AND (total_slots <= 7))),
    CONSTRAINT valid_slots CHECK ((filled_slots <= total_slots))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    reported_user_id uuid NOT NULL,
    reported_post_id uuid,
    reported_message_id uuid,
    report_type text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reports_description_check CHECK (((char_length(description) >= 10) AND (char_length(description) <= 1000))),
    CONSTRAINT reports_report_type_check CHECK ((report_type = ANY (ARRAY['inappropriate_content'::text, 'spam'::text, 'harassment'::text, 'fraud'::text, 'inappropriate_media'::text, 'false_information'::text, 'other'::text]))),
    CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'resolved'::text, 'dismissed'::text]))),
    CONSTRAINT valid_report_target CHECK (((reported_post_id IS NOT NULL) OR (reported_message_id IS NOT NULL) OR ((reported_post_id IS NULL) AND (reported_message_id IS NULL))))
);


--
-- Name: revenuecat_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenuecat_webhook_events (
    id bigint NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    app_user_id text NOT NULL,
    product_id text,
    entitlement_ids text[],
    period_type text,
    purchased_at timestamp with time zone,
    expiration_at timestamp with time zone,
    payload jsonb NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    action_taken text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: revenuecat_webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.revenuecat_webhook_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.revenuecat_webhook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: search_impressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_impressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    viewer_id uuid NOT NULL,
    viewed_profile_id uuid NOT NULL,
    context text DEFAULT 'search'::text NOT NULL,
    created_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    activity_type text NOT NULL,
    target_id uuid,
    target_type text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_id uuid NOT NULL,
    blocked_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT no_self_block CHECK ((blocker_id <> blocked_user_id))
);


--
-- Name: user_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    liker_user_id uuid NOT NULL,
    liked_user_id uuid NOT NULL,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    deleted_at timestamp with time zone,
    CONSTRAINT user_likes_type_check CHECK ((type = ANY (ARRAY['like'::text, 'super_like'::text, 'pass'::text])))
);

ALTER TABLE ONLY public.user_likes REPLICA IDENTITY FULL;


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    parent_pin text,
    pin_updated_at bigint,
    parent_email text,
    active_child_id text,
    onboarding_completed boolean DEFAULT false,
    subscription_active boolean DEFAULT false,
    subscription_plan text,
    trial_ends_at text,
    subscription_product_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: account_deletions account_deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletions
    ADD CONSTRAINT account_deletions_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_key_key UNIQUE (key);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);


--
-- Name: availability availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_pkey PRIMARY KEY (id);


--
-- Name: availability availability_user_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_user_id_date_key UNIQUE (user_id, date);


--
-- Name: banned_emails banned_emails_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_emails
    ADD CONSTRAINT banned_emails_email_unique UNIQUE (email);


--
-- Name: banned_emails banned_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_emails
    ADD CONSTRAINT banned_emails_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_slug_key UNIQUE (slug);


--
-- Name: chats chats_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_legacy_id_key UNIQUE (legacy_id);


--
-- Name: chats chats_match_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_match_id_key UNIQUE (match_id);


--
-- Name: chats chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pkey PRIMARY KEY (id);


--
-- Name: contact_inquiries contact_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_inquiries
    ADD CONSTRAINT contact_inquiries_pkey PRIMARY KEY (id);


--
-- Name: contact_replies contact_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_replies
    ADD CONSTRAINT contact_replies_pkey PRIMARY KEY (id);


--
-- Name: daily_recommendations daily_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_recommendations
    ADD CONSTRAINT daily_recommendations_pkey PRIMARY KEY (id);


--
-- Name: daily_snapshots daily_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_snapshots
    ADD CONSTRAINT daily_snapshots_pkey PRIMARY KEY (id);


--
-- Name: daily_snapshots daily_snapshots_snapshot_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_snapshots
    ADD CONSTRAINT daily_snapshots_snapshot_date_key UNIQUE (snapshot_date);


--
-- Name: dismissed_announcements dismissed_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dismissed_announcements
    ADD CONSTRAINT dismissed_announcements_pkey PRIMARY KEY (user_id, announcement_id);


--
-- Name: disposable_email_domains disposable_email_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disposable_email_domains
    ADD CONSTRAINT disposable_email_domains_pkey PRIMARY KEY (domain);


--
-- Name: golf_courses golf_courses_gora_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_courses
    ADD CONSTRAINT golf_courses_gora_course_id_key UNIQUE (gora_course_id);


--
-- Name: golf_courses golf_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golf_courses
    ADD CONSTRAINT golf_courses_pkey PRIMARY KEY (id);


--
-- Name: kyc_submissions kyc_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_submissions
    ADD CONSTRAINT kyc_submissions_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: matches matches_user1_id_user2_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user1_id_user2_id_key UNIQUE (user1_id, user2_id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: messages messages_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_legacy_id_key UNIQUE (legacy_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: moderation_log moderation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_log
    ADD CONSTRAINT moderation_log_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: post_comments post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);


--
-- Name: post_likes post_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_pkey PRIMARY KEY (id);


--
-- Name: post_likes post_likes_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_post_id_user_id_key UNIQUE (post_id, user_id);


--
-- Name: post_media post_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_pkey PRIMARY KEY (id);


--
-- Name: post_reactions post_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_pkey PRIMARY KEY (id);


--
-- Name: post_reactions post_reactions_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_post_id_user_id_key UNIQUE (post_id, user_id);


--
-- Name: post_views post_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_pkey PRIMARY KEY (id);


--
-- Name: posts posts_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_legacy_id_key UNIQUE (legacy_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: profile_views profile_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_pkey PRIMARY KEY (id);


--
-- Name: profile_views profile_views_viewer_viewed_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_viewer_viewed_unique UNIQUE (viewer_id, viewed_profile_id);


--
-- Name: profiles profiles_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_legacy_id_key UNIQUE (legacy_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: recruitment_applications recruitment_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_pkey PRIMARY KEY (id);


--
-- Name: recruitment_applications recruitment_applications_recruitment_id_applicant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_recruitment_id_applicant_id_key UNIQUE (recruitment_id, applicant_id);


--
-- Name: recruitment_views recruitment_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_views
    ADD CONSTRAINT recruitment_views_pkey PRIMARY KEY (id);


--
-- Name: recruitments recruitments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitments
    ADD CONSTRAINT recruitments_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: revenuecat_webhook_events revenuecat_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenuecat_webhook_events
    ADD CONSTRAINT revenuecat_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: search_impressions search_impressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_impressions
    ADD CONSTRAINT search_impressions_pkey PRIMARY KEY (id);


--
-- Name: user_blocks unique_block; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT unique_block UNIQUE (blocker_id, blocked_user_id);


--
-- Name: daily_recommendations unique_daily_recommendation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_recommendations
    ADD CONSTRAINT unique_daily_recommendation UNIQUE (user_id, recommended_user_id, recommendation_date);


--
-- Name: user_activities user_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activities
    ADD CONSTRAINT user_activities_pkey PRIMARY KEY (id);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);


--
-- Name: user_likes user_likes_liker_user_id_liked_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_likes
    ADD CONSTRAINT user_likes_liker_user_id_liked_user_id_key UNIQUE (liker_user_id, liked_user_id);


--
-- Name: user_likes user_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_likes
    ADD CONSTRAINT user_likes_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- Name: idx_active_matches; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_matches ON public.matches USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_applications_applicant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_applicant_id ON public.recruitment_applications USING btree (applicant_id);


--
-- Name: idx_applications_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_pending ON public.recruitment_applications USING btree (recruitment_id, status) WHERE (status = 'pending'::text);


--
-- Name: idx_applications_recruitment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_recruitment_id ON public.recruitment_applications USING btree (recruitment_id);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status ON public.recruitment_applications USING btree (status);


--
-- Name: idx_availability_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_date ON public.availability USING btree (date);


--
-- Name: idx_availability_date_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_date_range ON public.availability USING btree (date) WHERE (is_available = true);


--
-- Name: idx_availability_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_user_date ON public.availability USING btree (user_id, date);


--
-- Name: idx_availability_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_user_id ON public.availability USING btree (user_id);


--
-- Name: idx_banned_emails_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banned_emails_email ON public.banned_emails USING btree (lower(email));


--
-- Name: idx_blog_posts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_category ON public.blog_posts USING btree (category);


--
-- Name: idx_blog_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_created_at ON public.blog_posts USING btree (created_at DESC);


--
-- Name: idx_blog_posts_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_slug ON public.blog_posts USING btree (slug);


--
-- Name: idx_blog_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_status ON public.blog_posts USING btree (status);


--
-- Name: idx_chats_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_last_message ON public.chats USING btree (last_message_at DESC NULLS LAST);


--
-- Name: idx_chats_last_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_last_message_id ON public.chats USING btree (last_message_id);


--
-- Name: idx_chats_unique_match; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_chats_unique_match ON public.chats USING btree (match_id) WHERE (match_id IS NOT NULL);


--
-- Name: idx_chats_unique_participants; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_chats_unique_participants ON public.chats USING btree (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));


--
-- Name: idx_chats_user1_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_user1_updated ON public.chats USING btree (user1_id, updated_at DESC);


--
-- Name: idx_chats_user2_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_user2_updated ON public.chats USING btree (user2_id, updated_at DESC);


--
-- Name: idx_contact_inquiries_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_inquiries_created_at ON public.contact_inquiries USING btree (created_at DESC);


--
-- Name: idx_contact_inquiries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_inquiries_status ON public.contact_inquiries USING btree (status);


--
-- Name: idx_contact_inquiries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_inquiries_user_id ON public.contact_inquiries USING btree (user_id);


--
-- Name: idx_contact_replies_inquiry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_replies_inquiry_id ON public.contact_replies USING btree (inquiry_id);


--
-- Name: idx_contact_replies_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_replies_is_read ON public.contact_replies USING btree (is_read) WHERE (is_read = false);


--
-- Name: idx_daily_recommendations_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_recommendations_user_date ON public.daily_recommendations USING btree (user_id, recommendation_date);


--
-- Name: idx_daily_snapshots_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_snapshots_date ON public.daily_snapshots USING btree (snapshot_date DESC);


--
-- Name: idx_golf_courses_gora_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_courses_gora_id ON public.golf_courses USING btree (gora_course_id);


--
-- Name: idx_golf_courses_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_courses_name_trgm ON public.golf_courses USING gin (name public.gin_trgm_ops);


--
-- Name: idx_golf_courses_prefecture; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golf_courses_prefecture ON public.golf_courses USING btree (prefecture);


--
-- Name: idx_kyc_submissions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_submissions_created_at ON public.kyc_submissions USING btree (created_at DESC);


--
-- Name: idx_kyc_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_submissions_status ON public.kyc_submissions USING btree (status);


--
-- Name: idx_kyc_submissions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_submissions_user_id ON public.kyc_submissions USING btree (user_id);


--
-- Name: idx_matches_unseen_user1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_unseen_user1 ON public.matches USING btree (user1_id) WHERE (seen_by_user1 = false);


--
-- Name: idx_matches_unseen_user2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_unseen_user2 ON public.matches USING btree (user2_id) WHERE (seen_by_user2 = false);


--
-- Name: idx_matches_user1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user1 ON public.matches USING btree (user1_id);


--
-- Name: idx_matches_user1_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user1_active ON public.matches USING btree (user1_id) WHERE (is_active = true);


--
-- Name: idx_matches_user2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user2 ON public.matches USING btree (user2_id);


--
-- Name: idx_matches_user2_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user2_active ON public.matches USING btree (user2_id) WHERE (is_active = true);


--
-- Name: idx_memberships_expiration_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_expiration_date ON public.memberships USING btree (expiration_date);


--
-- Name: idx_memberships_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_is_active ON public.memberships USING btree (is_active);


--
-- Name: idx_memberships_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_user_id ON public.memberships USING btree (user_id);


--
-- Name: idx_messages_attachment_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_attachment_path ON public.messages USING btree (attachment_path) WHERE (attachment_path IS NOT NULL);


--
-- Name: idx_messages_attachments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_attachments ON public.messages USING btree (type) WHERE (type = ANY (ARRAY['image'::text, 'video'::text]));


--
-- Name: idx_messages_chat_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_chat_created ON public.messages USING btree (chat_id, created_at);


--
-- Name: idx_messages_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_chat_id ON public.messages USING btree (chat_id);


--
-- Name: idx_messages_chat_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_chat_latest ON public.messages USING btree (chat_id, created_at DESC);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);


--
-- Name: idx_messages_receiver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_receiver_id ON public.messages USING btree (receiver_id);


--
-- Name: idx_messages_receiver_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_receiver_unread ON public.messages USING btree (receiver_id, chat_id) WHERE (is_read = false);


--
-- Name: idx_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);


--
-- Name: idx_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unread ON public.messages USING btree (chat_id, is_read, created_at);


--
-- Name: idx_messages_unread_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unread_receiver ON public.messages USING btree (receiver_id, is_read, created_at DESC) WHERE (is_read = false);


--
-- Name: idx_moderation_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_log_created ON public.moderation_log USING btree (created_at DESC);


--
-- Name: idx_moderation_log_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_log_target ON public.moderation_log USING btree (target_user_id);


--
-- Name: idx_notification_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_preferences_user_id ON public.notification_preferences USING btree (user_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_from_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_from_user ON public.notifications USING btree (from_user_id);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: idx_post_comments_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_parent_id ON public.post_comments USING btree (parent_id);


--
-- Name: idx_post_comments_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_post_id ON public.post_comments USING btree (post_id);


--
-- Name: idx_post_comments_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_thread ON public.post_comments USING btree (post_id, parent_id, created_at);


--
-- Name: idx_post_comments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_user_id ON public.post_comments USING btree (user_id);


--
-- Name: idx_post_likes_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_likes_post_id ON public.post_likes USING btree (post_id);


--
-- Name: idx_post_likes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_likes_type ON public.post_likes USING btree (type);


--
-- Name: idx_post_likes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_likes_user_id ON public.post_likes USING btree (user_id);


--
-- Name: idx_post_media_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_media_post_id ON public.post_media USING btree (post_id);


--
-- Name: idx_post_media_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_media_type ON public.post_media USING btree (media_type);


--
-- Name: idx_post_reactions_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_reactions_post_id ON public.post_reactions USING btree (post_id);


--
-- Name: idx_post_reactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_reactions_type ON public.post_reactions USING btree (reaction_type);


--
-- Name: idx_post_reactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_reactions_user_id ON public.post_reactions USING btree (user_id);


--
-- Name: idx_post_reactions_user_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_reactions_user_post ON public.post_reactions USING btree (user_id, post_id);


--
-- Name: idx_post_views_daily_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_post_views_daily_dedup ON public.post_views USING btree (viewer_id, post_id, created_date);


--
-- Name: idx_post_views_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_views_post_id ON public.post_views USING btree (post_id);


--
-- Name: idx_posts_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_created_at_desc ON public.posts USING btree (created_at DESC);


--
-- Name: idx_posts_legacy_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_legacy_id ON public.posts USING btree (legacy_id);


--
-- Name: idx_posts_popular; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_popular ON public.posts USING btree (created_at DESC, likes_count DESC);


--
-- Name: idx_posts_user_content_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_posts_user_content_hash ON public.posts USING btree (user_id, content_hash);


--
-- Name: idx_posts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_user_id ON public.posts USING btree (user_id);


--
-- Name: idx_posts_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_user_id_created_at ON public.posts USING btree (user_id, created_at DESC);


--
-- Name: idx_posts_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_visibility ON public.posts USING btree (visibility, created_at DESC);


--
-- Name: idx_profile_views_viewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_views_viewed_at ON public.profile_views USING btree (viewed_at DESC);


--
-- Name: idx_profile_views_viewed_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_views_viewed_profile_id ON public.profile_views USING btree (viewed_profile_id);


--
-- Name: idx_profile_views_viewer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_views_viewer_id ON public.profile_views USING btree (viewer_id);


--
-- Name: idx_profile_views_viewer_viewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_views_viewer_viewed ON public.profile_views USING btree (viewer_id, viewed_profile_id, viewed_at DESC);


--
-- Name: idx_profiles_gender_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_gender_login ON public.profiles USING btree (gender, last_login DESC);


--
-- Name: idx_profiles_golf_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_golf_skill ON public.profiles USING btree (golf_skill_level);


--
-- Name: idx_profiles_is_banned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_is_banned ON public.profiles USING btree (id) WHERE (is_banned = true);


--
-- Name: idx_profiles_kyc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_kyc_status ON public.profiles USING btree (kyc_status);


--
-- Name: idx_profiles_last_active_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_last_active_at ON public.profiles USING btree (last_active_at DESC);


--
-- Name: idx_profiles_last_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_last_login ON public.profiles USING btree (last_login);


--
-- Name: idx_profiles_legacy_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_legacy_id ON public.profiles USING btree (legacy_id);


--
-- Name: idx_profiles_prefecture; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_prefecture ON public.profiles USING btree (prefecture);


--
-- Name: idx_profiles_premium_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_premium_source ON public.profiles USING btree (premium_source) WHERE (premium_source IS NOT NULL);


--
-- Name: idx_profiles_push_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_push_token ON public.profiles USING btree (push_token);


--
-- Name: idx_profiles_received_likes_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_received_likes_count ON public.profiles USING btree (received_likes_count DESC);


--
-- Name: idx_profiles_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_search ON public.profiles USING btree (prefecture, golf_skill_level, age);


--
-- Name: idx_profiles_skill_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_skill_level ON public.profiles USING btree (golf_skill_level);


--
-- Name: idx_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id);


--
-- Name: idx_recruitment_views_daily_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recruitment_views_daily_dedup ON public.recruitment_views USING btree (viewer_id, recruitment_id, created_date);


--
-- Name: idx_recruitment_views_recruitment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitment_views_recruitment_id ON public.recruitment_views USING btree (recruitment_id);


--
-- Name: idx_recruitments_course_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitments_course_type ON public.recruitments USING btree (course_type);


--
-- Name: idx_recruitments_host_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitments_host_id ON public.recruitments USING btree (host_id);


--
-- Name: idx_recruitments_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitments_listing ON public.recruitments USING btree (is_visible, status, play_date) WHERE ((is_visible = true) AND (status = ANY (ARRAY['open'::text, 'full'::text])));


--
-- Name: idx_recruitments_play_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitments_play_date ON public.recruitments USING btree (play_date);


--
-- Name: idx_recruitments_prefecture; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitments_prefecture ON public.recruitments USING btree (prefecture);


--
-- Name: idx_recruitments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitments_status ON public.recruitments USING btree (status);


--
-- Name: idx_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at DESC);


--
-- Name: idx_reports_reported_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reported_message_id ON public.reports USING btree (reported_message_id) WHERE (reported_message_id IS NOT NULL);


--
-- Name: idx_reports_reported_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reported_post_id ON public.reports USING btree (reported_post_id) WHERE (reported_post_id IS NOT NULL);


--
-- Name: idx_reports_reported_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reported_user_id ON public.reports USING btree (reported_user_id);


--
-- Name: idx_reports_reporter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reporter_id ON public.reports USING btree (reporter_id);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.reports USING btree (status);


--
-- Name: idx_revenuecat_webhook_events_app_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenuecat_webhook_events_app_user_id ON public.revenuecat_webhook_events USING btree (app_user_id);


--
-- Name: idx_revenuecat_webhook_events_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_revenuecat_webhook_events_event_id ON public.revenuecat_webhook_events USING btree (event_id);


--
-- Name: idx_revenuecat_webhook_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenuecat_webhook_events_type ON public.revenuecat_webhook_events USING btree (event_type);


--
-- Name: idx_search_impressions_daily_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_search_impressions_daily_dedup ON public.search_impressions USING btree (viewer_id, viewed_profile_id, context, created_date);


--
-- Name: idx_search_impressions_viewed_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_impressions_viewed_profile ON public.search_impressions USING btree (viewed_profile_id);


--
-- Name: idx_user_activities_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activities_created_at ON public.user_activities USING btree (created_at DESC);


--
-- Name: idx_user_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activities_type ON public.user_activities USING btree (activity_type);


--
-- Name: idx_user_activities_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activities_user_id ON public.user_activities USING btree (user_id);


--
-- Name: idx_user_blocks_blocked_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocked_user_id ON public.user_blocks USING btree (blocked_user_id);


--
-- Name: idx_user_blocks_blocker_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocker_id ON public.user_blocks USING btree (blocker_id);


--
-- Name: idx_user_likes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_active ON public.user_likes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_user_likes_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_deleted ON public.user_likes USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_user_likes_liked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_liked ON public.user_likes USING btree (liked_user_id);


--
-- Name: idx_user_likes_liked_liker_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_liked_liker_active ON public.user_likes USING btree (liked_user_id, liker_user_id) WHERE (is_active = true);


--
-- Name: idx_user_likes_liker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_liker ON public.user_likes USING btree (liker_user_id);


--
-- Name: idx_user_likes_liker_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_liker_active ON public.user_likes USING btree (liker_user_id, liked_user_id) WHERE (is_active = true);


--
-- Name: idx_user_likes_liker_liked_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_liker_liked_active ON public.user_likes USING btree (liker_user_id, liked_user_id) WHERE (is_active = true);


--
-- Name: idx_user_likes_liker_type_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_liker_type_active ON public.user_likes USING btree (liker_user_id, type) WHERE (is_active = true);


--
-- Name: idx_user_likes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_likes_type ON public.user_likes USING btree (type);


--
-- Name: idx_user_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id);


--
-- Name: user_likes create_match_on_mutual_like; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER create_match_on_mutual_like AFTER INSERT OR UPDATE ON public.user_likes FOR EACH ROW EXECUTE FUNCTION public.check_and_create_match();


--
-- Name: user_likes like_rate_limit_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER like_rate_limit_trigger BEFORE INSERT ON public.user_likes FOR EACH ROW EXECUTE FUNCTION public.enforce_like_rate_limit();


--
-- Name: messages message_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER message_created AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_on_message();


--
-- Name: kyc_submissions sync_kyc_status_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_kyc_status_trigger AFTER INSERT OR UPDATE OF status ON public.kyc_submissions FOR EACH ROW EXECUTE FUNCTION public.sync_kyc_status_to_profile();


--
-- Name: memberships sync_premium_on_membership_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_premium_on_membership_change AFTER INSERT OR DELETE OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.sync_profile_premium_status();


--
-- Name: posts trg_posts_content_hash; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_posts_content_hash BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.generate_post_content_hash();


--
-- Name: user_likes trg_update_received_likes_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_received_likes_count AFTER INSERT OR DELETE OR UPDATE ON public.user_likes FOR EACH ROW EXECUTE FUNCTION public.update_received_likes_count();


--
-- Name: recruitment_applications trigger_applications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_applications_updated_at BEFORE UPDATE ON public.recruitment_applications FOR EACH ROW EXECUTE FUNCTION public.update_recruitment_updated_at();


--
-- Name: matches trigger_create_chat_on_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_chat_on_match AFTER INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.create_chat_on_match();


--
-- Name: user_likes trigger_create_like_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_like_notification AFTER INSERT OR UPDATE ON public.user_likes FOR EACH ROW EXECUTE FUNCTION public.create_like_notification();


--
-- Name: matches trigger_create_match_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_match_notification AFTER INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.create_match_notification();


--
-- Name: user_likes trigger_create_match_on_mutual_like; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_match_on_mutual_like AFTER INSERT ON public.user_likes FOR EACH ROW EXECUTE FUNCTION public.create_match_on_mutual_like();


--
-- Name: messages trigger_create_message_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_message_notification AFTER INSERT ON public.messages FOR EACH ROW WHEN ((new.sender_id <> new.receiver_id)) EXECUTE FUNCTION public.create_message_notification();


--
-- Name: post_reactions trigger_create_post_reaction_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_post_reaction_notification AFTER INSERT ON public.post_reactions FOR EACH ROW EXECUTE FUNCTION public.create_post_reaction_notification();


--
-- Name: recruitment_applications trigger_recruitment_application_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_recruitment_application_notification AFTER INSERT ON public.recruitment_applications FOR EACH ROW EXECUTE FUNCTION public.create_recruitment_application_notification();


--
-- Name: recruitment_applications trigger_recruitment_response_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_recruitment_response_notification AFTER UPDATE ON public.recruitment_applications FOR EACH ROW EXECUTE FUNCTION public.create_recruitment_response_notification();


--
-- Name: recruitments trigger_recruitments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_recruitments_updated_at BEFORE UPDATE ON public.recruitments FOR EACH ROW EXECUTE FUNCTION public.update_recruitment_updated_at();


--
-- Name: messages trigger_reset_unread_on_read; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_reset_unread_on_read AFTER UPDATE OF is_read ON public.messages FOR EACH ROW EXECUTE FUNCTION public.reset_chat_unread_count();


--
-- Name: notifications trigger_send_push_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_send_push_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.send_push_notification_on_insert();


--
-- Name: profiles trigger_set_default_last_active_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_default_last_active_at BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_default_last_active_at();


--
-- Name: profiles trigger_sync_is_verified_with_kyc_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_sync_is_verified_with_kyc_status BEFORE UPDATE ON public.profiles FOR EACH ROW WHEN ((old.kyc_status IS DISTINCT FROM new.kyc_status)) EXECUTE FUNCTION public.sync_is_verified_with_kyc_status();


--
-- Name: messages trigger_update_chat_on_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_chat_on_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_last_message();


--
-- Name: messages trigger_update_chat_unread_counts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_chat_unread_counts AFTER INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_unread_counts();


--
-- Name: recruitment_applications trigger_update_filled_slots; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_filled_slots AFTER UPDATE ON public.recruitment_applications FOR EACH ROW EXECUTE FUNCTION public.update_recruitment_filled_slots();


--
-- Name: kyc_submissions trigger_update_kyc_submissions_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_kyc_submissions_timestamp BEFORE UPDATE ON public.kyc_submissions FOR EACH ROW EXECUTE FUNCTION public.update_kyc_submissions_updated_at();


--
-- Name: notification_preferences trigger_update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();


--
-- Name: post_reactions trigger_update_post_reactions_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_post_reactions_count AFTER INSERT OR DELETE ON public.post_reactions FOR EACH ROW EXECUTE FUNCTION public.update_post_reactions_count();


--
-- Name: matches trigger_validate_match_mutual_likes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_validate_match_mutual_likes BEFORE INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.validate_match_mutual_likes();


--
-- Name: availability update_availability_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_availability_updated_at BEFORE UPDATE ON public.availability FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: blog_posts update_blog_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_blog_posts_updated_at();


--
-- Name: chats update_chats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: memberships update_memberships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages update_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: posts update_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_likes update_user_likes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_likes_updated_at BEFORE UPDATE ON public.user_likes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: availability availability_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chats chats_last_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_last_message_id_fkey FOREIGN KEY (last_message_id) REFERENCES public.messages(id);


--
-- Name: chats chats_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: chats chats_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chats chats_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: contact_inquiries contact_inquiries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_inquiries
    ADD CONSTRAINT contact_inquiries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: contact_replies contact_replies_inquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_replies
    ADD CONSTRAINT contact_replies_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.contact_inquiries(id) ON DELETE CASCADE;


--
-- Name: daily_recommendations daily_recommendations_recommended_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_recommendations
    ADD CONSTRAINT daily_recommendations_recommended_user_id_fkey FOREIGN KEY (recommended_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: daily_recommendations daily_recommendations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_recommendations
    ADD CONSTRAINT daily_recommendations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: dismissed_announcements dismissed_announcements_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dismissed_announcements
    ADD CONSTRAINT dismissed_announcements_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: dismissed_announcements dismissed_announcements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dismissed_announcements
    ADD CONSTRAINT dismissed_announcements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: kyc_submissions kyc_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_submissions
    ADD CONSTRAINT kyc_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: matches matches_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: matches matches_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;


--
-- Name: messages messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: moderation_log moderation_log_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_log
    ADD CONSTRAINT moderation_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_likes post_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_likes post_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_media post_media_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_reactions post_reactions_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_reactions post_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_views post_views_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_views post_views_viewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: posts posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_views profile_views_viewed_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_viewed_profile_id_fkey FOREIGN KEY (viewed_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_views profile_views_viewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: recruitment_applications recruitment_applications_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: recruitment_applications recruitment_applications_recruitment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id) ON DELETE CASCADE;


--
-- Name: recruitment_views recruitment_views_recruitment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_views
    ADD CONSTRAINT recruitment_views_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id) ON DELETE CASCADE;


--
-- Name: recruitment_views recruitment_views_viewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_views
    ADD CONSTRAINT recruitment_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: recruitments recruitments_golf_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitments
    ADD CONSTRAINT recruitments_golf_course_id_fkey FOREIGN KEY (golf_course_id) REFERENCES public.golf_courses(id);


--
-- Name: recruitments recruitments_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitments
    ADD CONSTRAINT recruitments_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reports reports_reported_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reported_message_id_fkey FOREIGN KEY (reported_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: reports reports_reported_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reported_post_id_fkey FOREIGN KEY (reported_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: reports reports_reported_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: search_impressions search_impressions_viewed_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_impressions
    ADD CONSTRAINT search_impressions_viewed_profile_id_fkey FOREIGN KEY (viewed_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: search_impressions search_impressions_viewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_impressions
    ADD CONSTRAINT search_impressions_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_activities user_activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activities
    ADD CONSTRAINT user_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_likes user_likes_liked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_likes
    ADD CONSTRAINT user_likes_liked_user_id_fkey FOREIGN KEY (liked_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_likes user_likes_liker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_likes
    ADD CONSTRAINT user_likes_liker_user_id_fkey FOREIGN KEY (liker_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_media Allow deleting own post media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow deleting own post media" ON public.post_media FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = post_media.post_id) AND (posts.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: post_media Allow inserting own post media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow inserting own post media" ON public.post_media FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = post_media.post_id) AND (posts.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: app_config Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.app_config FOR SELECT USING (true);


--
-- Name: post_media Allow viewing all post media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow viewing all post media" ON public.post_media FOR SELECT TO authenticated USING (true);


--
-- Name: announcements Anyone can read announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read announcements" ON public.announcements FOR SELECT USING (true);


--
-- Name: golf_courses Anyone can read golf courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read golf courses" ON public.golf_courses FOR SELECT USING (true);


--
-- Name: blog_posts Anyone can read published blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read published blog posts" ON public.blog_posts FOR SELECT USING ((status = 'published'::text));


--
-- Name: blog_posts Authenticated can delete blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete blog posts" ON public.blog_posts FOR DELETE TO authenticated USING (true);


--
-- Name: blog_posts Authenticated can insert blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert blog posts" ON public.blog_posts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: blog_posts Authenticated can read all blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read all blog posts" ON public.blog_posts FOR SELECT TO authenticated USING (true);


--
-- Name: blog_posts Authenticated can update blog posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update blog posts" ON public.blog_posts FOR UPDATE TO authenticated USING (true);


--
-- Name: notifications Authenticated users can create notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create notifications" ON public.notifications FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (from_user_id = auth.uid()) OR (from_user_id IS NULL)));


--
-- Name: golf_courses Authenticated users can insert golf courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert golf courses" ON public.golf_courses FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: golf_courses Authenticated users can update golf courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update golf courses" ON public.golf_courses FOR UPDATE USING ((auth.uid() IS NOT NULL));


--
-- Name: availability Authenticated users can view availability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view availability" ON public.availability FOR SELECT TO authenticated USING (true);


--
-- Name: user_likes Authenticated users can view likes involving them; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view likes involving them" ON public.user_likes FOR SELECT TO authenticated USING (((liker_user_id = auth.uid()) OR (liked_user_id = auth.uid())));


--
-- Name: matches Authenticated users can view their own matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view their own matches" ON public.matches FOR SELECT TO authenticated USING (((user1_id = auth.uid()) OR (user2_id = auth.uid())));


--
-- Name: post_comments Comments are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comments are viewable by everyone" ON public.post_comments FOR SELECT USING (true);


--
-- Name: recruitment_applications Create own applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Create own applications" ON public.recruitment_applications FOR INSERT WITH CHECK (((applicant_id = auth.uid()) AND (NOT public.is_current_user_banned())));


--
-- Name: recruitments Create own recruitments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Create own recruitments" ON public.recruitments FOR INSERT WITH CHECK (((host_id = auth.uid()) AND (NOT public.is_current_user_banned())));


--
-- Name: recruitments Delete own recruitments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete own recruitments" ON public.recruitments FOR DELETE USING (((host_id = auth.uid()) AND (NOT public.is_current_user_banned())));


--
-- Name: recruitment_views Hosts can view their recruitment views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can view their recruitment views" ON public.recruitment_views FOR SELECT USING ((recruitment_id IN ( SELECT recruitments.id
   FROM public.recruitments
  WHERE (recruitments.host_id = auth.uid()))));


--
-- Name: post_views Post authors can view their post views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Post authors can view their post views" ON public.post_views FOR SELECT USING ((post_id IN ( SELECT posts.id
   FROM public.posts
  WHERE (posts.user_id = auth.uid()))));


--
-- Name: post_likes Post likes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Post likes are viewable by everyone" ON public.post_likes FOR SELECT USING (true);


--
-- Name: post_reactions Post reactions are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Post reactions are viewable by everyone" ON public.post_reactions FOR SELECT USING (true);


--
-- Name: posts Posts are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Posts are viewable by everyone" ON public.posts FOR SELECT USING (true);


--
-- Name: profiles Profiles are viewable except banned; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable except banned" ON public.profiles FOR SELECT USING (((id = ( SELECT auth.uid() AS uid)) OR (is_banned IS NOT TRUE)));


--
-- Name: user_likes Service role can view all likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can view all likes" ON public.user_likes FOR SELECT TO service_role USING (true);


--
-- Name: matches Service role can view all matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can view all matches" ON public.matches FOR SELECT TO service_role USING (true);


--
-- Name: recruitment_applications Update own or hosted applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update own or hosted applications" ON public.recruitment_applications FOR UPDATE USING (((applicant_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.recruitments
  WHERE ((recruitments.id = recruitment_applications.recruitment_id) AND (recruitments.host_id = auth.uid()))))));


--
-- Name: recruitments Update own recruitments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update own recruitments" ON public.recruitments FOR UPDATE USING (((host_id = auth.uid()) AND (NOT public.is_current_user_banned())));


--
-- Name: chats Users can create chats where they are a participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create chats where they are a participant" ON public.chats FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid) = user1_id) OR (( SELECT auth.uid() AS uid) = user2_id) OR (( SELECT auth.uid() AS uid) = ANY (participants))));


--
-- Name: matches Users can create matches where they are a participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create matches where they are a participant" ON public.matches FOR INSERT WITH CHECK ((((user1_id = auth.uid()) OR (user2_id = auth.uid())) AND (NOT public.is_current_user_banned())));


--
-- Name: kyc_submissions Users can create own KYC submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own KYC submissions" ON public.kyc_submissions FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_activities Users can create own activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own activities" ON public.user_activities FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: post_comments Users can create own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own comments" ON public.post_comments FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: contact_inquiries Users can create own inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own inquiries" ON public.contact_inquiries FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: post_likes Users can create own post likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own post likes" ON public.post_likes FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: post_reactions Users can create own post reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own post reactions" ON public.post_reactions FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: posts Users can create own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own posts" ON public.posts FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (NOT public.is_current_user_banned())));


--
-- Name: profile_views Users can create profile views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create profile views" ON public.profile_views FOR INSERT WITH CHECK (((auth.uid() = viewer_id) AND (NOT public.is_current_user_banned())));


--
-- Name: user_blocks Users can create their own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own blocks" ON public.user_blocks FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = blocker_id));


--
-- Name: user_likes Users can create their own likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own likes" ON public.user_likes FOR INSERT WITH CHECK (((liker_user_id = auth.uid()) AND (NOT public.is_current_user_banned())));


--
-- Name: reports Users can create their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own reports" ON public.reports FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = reporter_id));


--
-- Name: post_comments Users can delete own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own comments" ON public.post_comments FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: post_likes Users can delete own post likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own post likes" ON public.post_likes FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: post_reactions Users can delete own post reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own post reactions" ON public.post_reactions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: posts Users can delete own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE USING (((auth.uid() = user_id) AND (NOT public.is_current_user_banned())));


--
-- Name: user_blocks Users can delete their own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own blocks" ON public.user_blocks FOR DELETE USING ((( SELECT auth.uid() AS uid) = blocker_id));


--
-- Name: user_likes Users can delete their own likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own likes" ON public.user_likes FOR DELETE USING (((liker_user_id = auth.uid()) AND (NOT public.is_current_user_banned())));


--
-- Name: notifications Users can delete their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: daily_recommendations Users can insert own daily recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own daily recommendations" ON public.daily_recommendations FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: search_impressions Users can insert own impressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own impressions" ON public.search_impressions FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: memberships Users can insert own memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own memberships" ON public.memberships FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: post_views Users can insert own post views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own post views" ON public.post_views FOR INSERT WITH CHECK ((viewer_id = auth.uid()));


--
-- Name: recruitment_views Users can insert own recruitment views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own recruitment views" ON public.recruitment_views FOR INSERT WITH CHECK ((viewer_id = auth.uid()));


--
-- Name: notification_preferences Users can insert their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own preferences" ON public.notification_preferences FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.user_profiles FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid))::text = user_id));


--
-- Name: availability Users can manage own availability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own availability" ON public.availability USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: messages Users can mark received messages as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can mark received messages as read" ON public.messages FOR UPDATE USING (((auth.uid() = receiver_id) AND (NOT public.is_current_user_banned()))) WITH CHECK (((auth.uid() = receiver_id) AND (NOT public.is_current_user_banned())));


--
-- Name: daily_recommendations Users can read own daily recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own daily recommendations" ON public.daily_recommendations FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: contact_inquiries Users can read own inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own inquiries" ON public.contact_inquiries FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: contact_replies Users can read replies to own inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read replies to own inquiries" ON public.contact_replies FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.contact_inquiries
  WHERE ((contact_inquiries.id = contact_replies.inquiry_id) AND (contact_inquiries.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: messages Users can send messages in their chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages in their chats" ON public.messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_verified = true)))) AND (NOT public.is_current_user_banned())));


--
-- Name: post_comments Users can update own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own comments" ON public.post_comments FOR UPDATE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: contact_replies Users can update own inquiry replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own inquiry replies" ON public.contact_replies FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.contact_inquiries
  WHERE ((contact_inquiries.id = contact_replies.inquiry_id) AND (contact_inquiries.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: memberships Users can update own memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own memberships" ON public.memberships FOR UPDATE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: post_likes Users can update own post likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own post likes" ON public.post_likes FOR UPDATE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: posts Users can update own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own posts" ON public.posts FOR UPDATE USING (((auth.uid() = user_id) AND (NOT public.is_current_user_banned())));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: user_likes Users can update their own likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own likes" ON public.user_likes FOR UPDATE USING (((liker_user_id = auth.uid()) AND (NOT public.is_current_user_banned())));


--
-- Name: matches Users can update their own matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own matches" ON public.matches FOR UPDATE USING ((((user1_id = auth.uid()) OR (user2_id = auth.uid())) AND (NOT public.is_current_user_banned())));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: notification_preferences Users can update their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own preferences" ON public.notification_preferences FOR UPDATE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.user_profiles FOR UPDATE USING (((( SELECT auth.uid() AS uid))::text = user_id));


--
-- Name: chats Users can view chats for their matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view chats for their matches" ON public.chats FOR SELECT USING (((( SELECT auth.uid() AS uid) = user1_id) OR (( SELECT auth.uid() AS uid) = user2_id) OR (( SELECT auth.uid() AS uid) = ANY (participants))));


--
-- Name: search_impressions Users can view impressions of themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view impressions of themselves" ON public.search_impressions FOR SELECT USING ((viewed_profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = (auth.uid())::text))));


--
-- Name: messages Users can view messages in their chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their chats" ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: kyc_submissions Users can view own KYC submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own KYC submissions" ON public.kyc_submissions FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_activities Users can view own activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own activities" ON public.user_activities FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: memberships Users can view own memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own memberships" ON public.memberships FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_blocks Users can view their own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own blocks" ON public.user_blocks FOR SELECT USING ((( SELECT auth.uid() AS uid) = blocker_id));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: notification_preferences Users can view their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own preferences" ON public.notification_preferences FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.user_profiles FOR SELECT USING (((( SELECT auth.uid() AS uid))::text = user_id));


--
-- Name: profile_views Users can view their own profile views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile views" ON public.profile_views FOR SELECT USING (((auth.uid() = viewed_profile_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = profile_views.viewer_id) AND (profiles.is_banned = true)))))));


--
-- Name: reports Users can view their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own reports" ON public.reports FOR SELECT USING ((( SELECT auth.uid() AS uid) = reporter_id));


--
-- Name: dismissed_announcements Users insert own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own dismissals" ON public.dismissed_announcements FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: dismissed_announcements Users read own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own dismissals" ON public.dismissed_announcements FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: recruitment_applications View own or hosted applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own or hosted applications" ON public.recruitment_applications FOR SELECT USING (((applicant_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.recruitments
  WHERE ((recruitments.id = recruitment_applications.recruitment_id) AND (recruitments.host_id = auth.uid()))))));


--
-- Name: recruitments View visible recruitments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View visible recruitments" ON public.recruitments FOR SELECT USING (((is_visible = true) OR (host_id = auth.uid())));


--
-- Name: account_deletions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

--
-- Name: availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

--
-- Name: banned_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: dismissed_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dismissed_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: golf_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.golf_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: kyc_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: moderation_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: post_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: post_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: post_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

--
-- Name: post_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: post_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitment_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitment_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitment_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitment_views ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitments ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: revenuecat_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: search_impressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_impressions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict TombzJKlYJsN93KSZK3z8MNzsir1lAXvBSXCtHLxGnf0hLO36Kf3MnnUUc7V5yY

