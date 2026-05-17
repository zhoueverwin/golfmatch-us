// Didit KYC webhook receiver.
//
// Didit sends two relevant event types after a verification session:
//   - status.updated  (the session moved to In Progress / In Review / Approved / Declined)
//   - data.updated    (decision data became available, e.g. the OCR'd ID fields)
//
// We verify the X-Signature-V2 HMAC, pull the verified user's profile_id out
// of `vendor_data` (which create-didit-session sets at session creation),
// and write the verdict + ID-extracted fields to `profiles`.
//
// Gender from the government ID determines the paywall path downstream:
// female → free, male → premium-required. That's exactly the anti-bypass
// outcome we set this up for.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIDIT_WEBHOOK_SECRET = Deno.env.get("DIDIT_WEBHOOK_SECRET");

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
    [key: string]: unknown;
  };
  [key: string]: unknown;
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

// Normalise Didit's gender ("M"/"F") to our profiles.gender column ("male"/"female").
function normaliseGender(g: string | undefined): "male" | "female" | null {
  const up = (g || "").trim().toUpperCase();
  if (up === "M" || up === "MALE") return "male";
  if (up === "F" || up === "FEMALE") return "female";
  return null;
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

  // Approved: pull ID-extracted fields and write them as the source of truth.
  if (profileStatus === "approved") {
    const idData = event.decision?.id_verifications?.[0];
    const gender = normaliseGender(idData?.gender);
    const birthDate = idData?.date_of_birth || null;
    const age = idData?.age ?? null;

    const update: Record<string, unknown> = {
      kyc_status: "approved",
      kyc_verified_at: new Date().toISOString(),
      is_verified: true,
      updated_at: new Date().toISOString(),
    };
    if (gender) update.gender = gender;
    if (birthDate) update.birth_date = birthDate;
    if (age !== null && age !== undefined) update.age = age;

    const { error } = await supabase
      .from("profiles")
      .update(update)
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
      JSON.stringify({ status: "ok", action: "approved" }),
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
