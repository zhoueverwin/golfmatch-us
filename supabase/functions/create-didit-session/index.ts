// Creates a Didit KYC verification session for the authenticated caller.
//
// Called from the OnboardingKycScreen. Returns the hosted verification URL
// that the app then opens in an in-app browser. The session is bound to the
// caller's `profiles.id` via `vendor_data`, so the webhook can match the
// completed verdict back to the right user.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIDIT_API_KEY = Deno.env.get("DIDIT_API_KEY")!;
const DIDIT_WORKFLOW_ID = Deno.env.get("DIDIT_WORKFLOW_ID")!;

const DIDIT_BASE_URL = "https://verification.didit.me/v3";

// Deep link the app handles to return from the hosted Didit flow.
// expo-router / linking config in app.config.js already registers the
// `Golfmatch://` scheme; we just pick a path the app can route on.
const CALLBACK_URL = "Golfmatch://onboarding/kyc-callback";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Identify the caller via the Authorization header (Supabase auth JWT).
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Missing auth token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use the anon client to resolve the JWT → user, then the service-role
  // client to perform privileged writes.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid auth token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Our profiles.id is the same UUID as auth.users.id (handle_new_user
  // trigger sets it that way on signup).
  const profileId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Call Didit to create a session.
  let diditResponse: Response;
  try {
    diditResponse = await fetch(`${DIDIT_BASE_URL}/session/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": DIDIT_API_KEY,
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: profileId, // ← how the webhook will look us up
        callback: CALLBACK_URL,
        callback_method: "initiator",
        metadata: {
          source: "onboarding",
        },
      }),
    });
  } catch (err) {
    console.error("[create-didit-session] Network error calling Didit:", err);
    return new Response(
      JSON.stringify({ error: "Didit unreachable" }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!diditResponse.ok) {
    const text = await diditResponse.text();
    console.error(
      `[create-didit-session] Didit returned ${diditResponse.status}: ${text}`,
    );
    return new Response(
      JSON.stringify({
        error: "Didit session creation failed",
        upstream_status: diditResponse.status,
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const session = await diditResponse.json();

  // Mark the profile as "pending_review" so the app can subscribe and
  // observe the transition to "approved"/"rejected" via Realtime.
  await admin
    .from("profiles")
    .update({
      kyc_status: "pending_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  return new Response(
    JSON.stringify({
      session_id: session.session_id,
      url: session.url,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
