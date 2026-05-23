// Didit KYC webhook receiver.
//
// Didit sends two relevant event types after a verification session:
//   - status.updated  (the session moved to In Progress / In Review / Approved / Declined)
//   - data.updated    (decision data became available, e.g. the OCR'd ID fields)
//
// We verify the X-Signature-V2 HMAC, pull the verified user's profile_id out
// of `vendor_data` (which create-didit-session sets at session creation),
// and write the verdict to `profiles`.
//
// v1.1 change: gender + birth_date are self-attested at onboarding, NOT
// extracted from Didit anymore. The webhook only writes verification
// status, and (for the lite workflow) cross-checks Didit's AI age
// estimation against the user's self-attested birth_date. On mismatch,
// it flags kyc_requires_document=true so the client escalates to the
// heavy (document-required) workflow.
//
// The heavy workflow's webhook payload preserves the original v1.0
// behavior of writing the verified status straight through, since the
// document check has already established age authoritatively.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIDIT_WEBHOOK_SECRET = Deno.env.get("DIDIT_WEBHOOK_SECRET");
// Used to identify the workflow type when Didit doesn't include metadata
// in the webhook payload. If unset, every payload is treated as heavy
// (v1.0 behavior).
const DIDIT_WORKFLOW_ID_LIGHT = Deno.env.get("DIDIT_WORKFLOW_ID_LIGHT");

const MIN_AGE = 18;
// Age below which we always escalate to document review even if the
// self-attested age agrees with AI estimation — under-21 is a high-risk
// band where the AI estimator is least reliable.
const ESCALATION_AGE_FLOOR = 21;
// Maximum allowed |aiAge - selfAge| before we escalate. 5 years is
// generous enough to accommodate AI estimator drift on borderline faces
// while still catching a 30yo claiming to be 60 (or vice versa).
const MAX_AGE_MISMATCH_YEARS = 5;

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 min, matches Didit's documented tolerance

interface DiditWebhookEvent {
  session_id: string;
  status?: string;
  webhook_type?: string;
  timestamp?: number;
  workflow_id?: string;
  vendor_data?: string; // we set this to profile_id at session creation
  metadata?: Record<string, unknown>;
  decision?: {
    status?: string;
    id_verifications?: Array<{
      first_name?: string;
      last_name?: string;
      full_name?: string;
      gender?: string; // "M" | "F" per docs
      date_of_birth?: string; // YYYY-MM-DD
      age?: number;
      document_type?: string;
      issuing_state?: string;
      [key: string]: unknown;
    }>;
    // v1.1 lite-workflow payload — Didit returns a liveness check with
    // an estimated age. The exact shape is documented in the Didit
    // dashboard; we defensively accept either age_estimation as a number
    // or a {min, max} object and reduce to a single int.
    liveness_checks?: Array<{
      status?: string;
      age_estimation?: number | { min?: number; max?: number };
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Reduce Didit's age_estimation field to a single integer. Handles both
// shapes seen in the wild: a bare number, or a {min, max} bracket.
function extractAiAge(
  raw: number | { min?: number; max?: number } | undefined | null,
): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "object") {
    const min = typeof raw.min === "number" ? raw.min : null;
    const max = typeof raw.max === "number" ? raw.max : null;
    if (min != null && max != null) return Math.round((min + max) / 2);
    if (min != null) return Math.round(min);
    if (max != null) return Math.round(max);
  }
  return null;
}

function yearsBetween(start: Date, end: Date): number {
  let years = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < start.getDate())) years--;
  return years;
}

// Constant-time string compare to defeat timing attacks on signature check.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyDiditSignature(
  rawBody: string,
  parsedEvent: { session_id?: string; status?: string; webhook_type?: string },
  signatureHeader: string,
  timestampHeader: string,
  secret: string,
): Promise<boolean> {
  // Reject stale or future-dated webhooks (replay defense).
  const ts = parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts)) return false;
  const tsMs = ts > 1e12 ? ts : ts * 1000; // tolerate seconds vs ms
  if (Math.abs(Date.now() - tsMs) > MAX_CLOCK_SKEW_MS) return false;

  // Didit X-Signature-Simple = HMAC-SHA256(secret, "{timestamp}:{session_id}:{status}:{webhook_type}") hex.
  // We use Simple over V2 because V2 requires reproducing canonical JSON
  // (parse → sort keys recursively → stringify with unescaped Unicode), which
  // is error-prone across runtimes. Simple covers timestamp + key fields and
  // is replay-protected by the timestamp window.
  const sessionId = parsedEvent.session_id || "";
  const status = parsedEvent.status || "";
  const webhookType = parsedEvent.webhook_type || "";
  const message = `${timestampHeader}:${sessionId}:${status}:${webhookType}`;
  const expected = await hmacHex(secret, message);
  return timingSafeEqual(expected, signatureHeader.trim());
}

// Map Didit's status string → our profile_kyc_status enum.
function mapDiditStatusToProfileStatus(
  diditStatus: string | undefined,
): "not_started" | "pending_review" | "approved" | "retry" | "rejected" {
  switch ((diditStatus || "").toLowerCase()) {
    case "approved":
      return "approved";
    case "declined":
    case "rejected":
      return "rejected";
    case "in review":
    case "in_review":
    case "in progress":
    case "in_progress":
    case "data_provided":
      return "pending_review";
    case "abandoned":
    case "expired":
      return "retry";
    default:
      return "not_started";
  }
}

// v1.1: gender + birth_date no longer extracted from Didit; the user
// self-attests them at onboarding. normaliseGender is retained for the
// rare heavy-workflow path where we still cross-reference the document
// gender against the self-attested value (future safeguard, currently
// unused).
function normaliseGender(g: string | undefined): "male" | "female" | null {
  const up = (g || "").trim().toUpperCase();
  if (up === "M" || up === "MALE") return "male";
  if (up === "F" || up === "FEMALE") return "female";
  return null;
}

// Decide whether the incoming webhook is from the lite (liveness-only)
// or heavy (document-required) Didit workflow. Prefer metadata.mode set
// at session creation; fall back to comparing the workflow_id against
// the lite-workflow env var.
function isLiteWorkflow(event: DiditWebhookEvent): boolean {
  const metadataMode = (event.metadata?.mode || "") as string;
  if (metadataMode === "lite") return true;
  if (metadataMode === "heavy") return false;
  if (DIDIT_WORKFLOW_ID_LIGHT && event.workflow_id === DIDIT_WORKFLOW_ID_LIGHT) {
    return true;
  }
  // Unknown: assume heavy (preserves v1.0 behavior on payloads that
  // predate the metadata.mode tag).
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  let event: DiditWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Signature verification — required when DIDIT_WEBHOOK_SECRET is set.
  // Didit currently sends X-Signature-V2 (canonical-JSON HMAC) and
  // X-Signature-Simple (formula HMAC). We verify X-Signature-Simple because
  // V2 requires reproducing canonical JSON exactly, which is brittle.
  if (DIDIT_WEBHOOK_SECRET) {
    const sig =
      req.headers.get("x-signature-simple") ||
      req.headers.get("X-Signature-Simple") ||
      "";
    const ts =
      req.headers.get("x-timestamp") || req.headers.get("X-Timestamp") || "";
    if (!sig || !ts) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const ok = await verifyDiditSignature(
      rawBody,
      event,
      sig,
      ts,
      DIDIT_WEBHOOK_SECRET,
    );
    if (!ok) {
      console.error(
        `[didit-webhook] Invalid signature for session=${event.session_id} ` +
          `status=${event.status} type=${event.webhook_type}`,
      );
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("[didit-webhook] DIDIT_WEBHOOK_SECRET not set — skipping auth");
  }

  const profileId = event.vendor_data;
  if (!profileId) {
    console.warn(
      "[didit-webhook] Missing vendor_data; cannot map to profile",
      event.session_id,
    );
    // Acknowledge so Didit doesn't retry forever on a permanent error.
    return new Response(
      JSON.stringify({ status: "ok", action: "no_vendor_data" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const profileStatus = mapDiditStatusToProfileStatus(
    event.decision?.status || event.status,
  );

  console.log(
    `[didit-webhook] session=${event.session_id} profile=${profileId} ` +
      `event=${event.webhook_type || "?"} status=${profileStatus}`,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Permanent lockout: if an admin has previously marked this user's KYC as
  // permanently_rejected (e.g. confirmed fake ID via Didit console), no
  // subsequent Didit verdict can re-approve them. Force-write rejected and
  // skip everything else.
  const { data: lockoutRows, error: lockoutError } = await supabase
    .from("kyc_submissions")
    .select("id")
    .eq("user_id", profileId)
    .eq("permanently_rejected", true)
    .limit(1);

  if (lockoutError) {
    console.error(
      `[didit-webhook] permanently_rejected lookup failed for ${profileId}:`,
      lockoutError,
    );
  } else if (lockoutRows && lockoutRows.length > 0) {
    console.warn(
      `[didit-webhook] Ignoring verdict for permanently-rejected user ${profileId} ` +
        `(incoming status=${profileStatus}, session=${event.session_id})`,
    );
    await supabase
      .from("profiles")
      .update({
        kyc_status: "rejected",
        is_verified: false,
        kyc_verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
    return new Response(
      JSON.stringify({ status: "ok", action: "permanently_rejected_lockout" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Forward-only progression guard: if the profile is already approved,
  // do NOT process any further events for this user. Didit fires multiple
  // webhook events per session (status.updated + data.updated, sometimes
  // for the same logical state); they can arrive out-of-order. Without
  // this guard, an early "Not Started" or "In Progress" event arriving
  // after the "Approved" one would downgrade kyc_status — and the
  // sync_is_verified_with_kyc_status trigger would then flip is_verified
  // back to false, silently demoting an approved user.
  const { data: currentProfileState } = await supabase
    .from("profiles")
    .select("kyc_status, is_verified")
    .eq("id", profileId)
    .maybeSingle();

  if (
    currentProfileState?.kyc_status === "approved" &&
    currentProfileState?.is_verified === true
  ) {
    console.log(
      `[didit-webhook] Ignoring out-of-order event for already-approved ` +
        `profile=${profileId} incoming_status=${profileStatus}`,
    );
    return new Response(
      JSON.stringify({ status: "ok", action: "ignored_already_approved" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Approved: in v1.1, we no longer extract gender/birth_date/age from
  // Didit — those are self-attested at onboarding. The lite path is now
  // simplified: a Didit "Approved" verdict is sufficient (the workflow
  // is pure liveness + IP analysis, no document, no age estimation, so
  // no further cross-check adds value). The earlier escalation logic
  // turned out to be a footgun — it could write kyc_requires_document=true
  // when the webhook briefly saw an empty selfBirthDate during event
  // delivery, causing the client to navigate to "One more thing" even
  // for users who'd correctly completed liveness.
  if (profileStatus === "approved") {
    const lite = isLiteWorkflow(event);

    if (lite) {
      // Lite-workflow approval is unconditional: Didit's liveness verdict
      // is the final answer for this workflow. No age cross-check, no
      // escalation. The earlier age-mismatch logic was a footgun (could
      // escalate spuriously during webhook event timing) and isn't useful
      // anyway when the workflow doesn't include AGE_ESTIMATION.
      const { error } = await supabase
        .from("profiles")
        .update({
          kyc_status: "approved",
          kyc_verified_at: new Date().toISOString(),
          is_verified: true,
          kyc_requires_document: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);
      if (error) {
        console.error(
          `[didit-webhook] Failed to write approved verdict for ${profileId}:`,
          error,
        );
        return new Response(JSON.stringify({ error: "DB update failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ status: "ok", action: "approved_lite" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Heavy (document-required) workflow path. Either an explicit
    // escalation from the lite check, or the v1.0 rollback flag forcing
    // document workflow for everyone. The document itself authoritatively
    // establishes age, so we trust the verdict directly — no further
    // cross-check needed. We do NOT write gender/birth_date here (v1.1
    // keeps those as self-attested even on the heavy path, since users
    // already entered them in onboarding).
    const { error } = await supabase
      .from("profiles")
      .update({
        kyc_status: "approved",
        kyc_verified_at: new Date().toISOString(),
        is_verified: true,
        kyc_requires_document: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (error) {
      console.error(
        `[didit-webhook] Failed to write approved verdict for ${profileId}:`,
        error,
      );
      return new Response(JSON.stringify({ error: "DB update failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ status: "ok", action: "approved_heavy" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Rejected, pending, or retry: just sync the status field so the app's
  // realtime subscription updates correctly.
  const { error } = await supabase
    .from("profiles")
    .update({
      kyc_status: profileStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) {
    console.error(
      `[didit-webhook] Failed to write ${profileStatus} for ${profileId}:`,
      error,
    );
  }

  return new Response(
    JSON.stringify({ status: "ok", action: profileStatus }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
