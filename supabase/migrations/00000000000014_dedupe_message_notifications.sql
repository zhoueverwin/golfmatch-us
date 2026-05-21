-- Coalesce message notifications: at most one unread "X sent you a message"
-- row per (receiver, sender) pair. When the next message arrives while the
-- existing row is still unread, refresh that row (title/body/data/created_at)
-- in place instead of stacking a new entry on the My Page notifications list.
--
-- Once the receiver marks the notification or chat as read, the rule resets:
-- the next inbound message creates a fresh row, signalling "new activity in
-- this conversation since you last looked."
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  sender_name TEXT;
  existing_id UUID;
BEGIN
  SELECT name INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  SELECT id INTO existing_id
  FROM public.notifications
  WHERE user_id = NEW.receiver_id
    AND from_user_id = NEW.sender_id
    AND type = 'message'
    AND is_read = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.notifications
    SET title = COALESCE(sender_name, 'New message'),
        body = COALESCE(sender_name, 'Someone') || ' sent you a message',
        data = jsonb_build_object('chatId', NEW.chat_id, 'fromUserId', NEW.sender_id),
        created_at = NOW()
    WHERE id = existing_id;
  ELSE
    INSERT INTO public.notifications (
      user_id, type, title, body, from_user_id, data, is_read
    ) VALUES (
      NEW.receiver_id,
      'message',
      COALESCE(sender_name, 'New message'),
      COALESCE(sender_name, 'Someone') || ' sent you a message',
      NEW.sender_id,
      jsonb_build_object('chatId', NEW.chat_id, 'fromUserId', NEW.sender_id),
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;
