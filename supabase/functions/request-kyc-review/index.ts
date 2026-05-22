import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, authorization",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing bearer" }, 401);

  // User-scoped client to read auth.uid from the JWT.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: ue } = await userClient.auth.getUser();
  if (ue || !userData?.user) return json({ error: "unauthenticated" }, 401);
  const authUid = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // auth.users.id -> profiles.user_id (stored as text)
  const { data: profile, error: pe } = await admin
    .from("profiles")
    .select("id, kyc_status, kyc_attempt_count, is_banned")
    .eq("user_id", authUid)
    .single();
  if (pe || !profile) return json({ error: "profile not found" }, 404);
  if (profile.is_banned) return json({ error: "account is banned" }, 403);

  // Gate: only allow manual-review request if the user has failed Didit at
  // least twice. Stops drive-by spam from flooding the admin queue.
  if (profile.kyc_status !== "rejected")
    return json({ error: "latest status is not rejected" }, 400);
  if ((profile.kyc_attempt_count ?? 0) < 2)
    return json({ error: "need at least 2 prior attempts" }, 400);

  // Flip the profile into the admin review queue. The kyc_admin_decided_at
  // column stays NULL so the queue picks them up. The DB trigger that
  // maintains kyc_attempt_count does NOT increment for pending_review
  // transitions, so the counter is preserved.
  const now = new Date().toISOString();
  const { error: u1 } = await admin
    .from("profiles")
    .update({
      kyc_status: "pending_review",
      kyc_admin_decided_at: null,
      updated_at: now,
    })
    .eq("id", profile.id);
  if (u1) return json({ error: u1.message }, 500);

  // TODO: notify admin (Slack webhook / push / email). Channel TBD with user.
  return json({ ok: true, status: "pending_review" });
});
