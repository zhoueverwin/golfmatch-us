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
// Heavy workflow — full document + selfie + AML + DB validation. Used as
// the fallback if no lite workflow is configured, and as the explicit
// escalation target when the lite workflow's age check is inconclusive.
const DIDIT_WORKFLOW_ID_HEAVY = Deno.env.get("DIDIT_WORKFLOW_ID")!;
// Lite workflow ("Golfmatch Liveness Only"), KYC type, features
// LIVENESS (face_liveness_method=PASSIVE) + IP_ANALYSIS. Created via
// Didit API on 2026-05-23. PASSIVE liveness has a 500/mo free tier so
// this workflow is the right default until we know we need stronger
// anti-spoofing.
//
// FUTURE UPGRADE (when activation data shows we need it): swap to the
// ACTIVE_3D workflow already created at bfcab8c0-4411-43d4-a781-dbd911947f6e
// ("Golfmatch Liveness 3D"). ACTIVE_3D = user performs a small head/face
// motion that confirms liveness — much harder to spoof with a static
// photo, but costs $0.15/session with NO free tier. Top up Didit credits
// first (POST /v3/billing/top-up/ returns a Stripe checkout URL; balance
// must exceed ~$0.18 per session before sessions stop 402'ing). Then
// change the constant below to the ACTIVE_3D workflow ID and redeploy.
//
// Env var DIDIT_WORKFLOW_ID_LIGHT still overrides the default — useful
// for testing the ACTIVE_3D workflow without a redeploy.
const DIDIT_WORKFLOW_ID_LIGHT_DEFAULT = "8b18c14b-a401-419d-bfbc-a4e68baaf783";
const DIDIT_WORKFLOW_ID_LIGHT =
  Deno.env.get("DIDIT_WORKFLOW_ID_LIGHT") || DIDIT_WORKFLOW_ID_LIGHT_DEFAULT;

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

  // DEFENSE IN DEPTH: refuse to create a session for an already-verified
  // user. The sync_is_verified_with_kyc_status DB trigger flips
  // is_verified=false the moment we write kyc_status='pending_review'
  // below, silently demoting an approved user. Caught 2026-05-23 after
  // Xi's profile got demoted between sign-out + sign-in due to a stale
  // userProfile cache on the client triggering an unnecessary auto-launch.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("kyc_status, is_verified")
    .eq("id", profileId)
    .maybeSingle();

  if (
    existingProfile?.is_verified === true &&
    existingProfile?.kyc_status === "approved"
  ) {
    console.warn(
      `[create-didit-session] Refusing to create session for already-verified user ${profileId}`,
    );
    return new Response(
      JSON.stringify({ error: "Already verified", already_verified: true }),
      {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Parse the request body for the workflow mode. mode='lite' is the v1.1
  // default (liveness-only); mode='heavy' is the escalation path. Missing
  // body → lite (so callers that haven't been updated still work).
  let requestedMode: "lite" | "heavy" = "lite";
  try {
    const body = await req.json().catch(() => null);
    if (body && (body.mode === "lite" || body.mode === "heavy")) {
      requestedMode = body.mode;
    }
  } catch {
    // Ignore parse errors — fall back to lite.
  }

  // Feature flag rollback: if app_config.kyc_workflow is 'document_required',
  // force-route everything through the heavy workflow (v1.0 behavior). Set
  // this when we need to abandon the lite workflow without a redeploy.
  const { data: flagRow } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "kyc_workflow")
    .maybeSingle();
  const flag = flagRow?.value as string | undefined; // JSONB string
  const flagForcesHeavy = flag === "document_required";

  const effectiveMode: "lite" | "heavy" =
    flagForcesHeavy || requestedMode === "heavy" ? "heavy" : "lite";
  const workflowId =
    effectiveMode === "lite" ? DIDIT_WORKFLOW_ID_LIGHT : DIDIT_WORKFLOW_ID_HEAVY;

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
        workflow_id: workflowId,
        vendor_data: profileId, // ← how the webhook will look us up
        callback: CALLBACK_URL,
        callback_method: "initiator",
        metadata: {
          source: "onboarding",
          mode: effectiveMode,
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
  // observe the transition to "approved"/"rejected" via Realtime. Also
  // clear any stale kyc_requires_document flag so the client doesn't
  // bounce the user straight back to the escalation screen.
  await admin
    .from("profiles")
    .update({
      kyc_status: "pending_review",
      kyc_requires_document: effectiveMode === "heavy" ? true : false,
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
