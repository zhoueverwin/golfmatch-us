import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

// Events that grant premium
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
]);

// Events that revoke premium
const REVOKE_EVENTS = new Set([
  "EXPIRATION",
]);

// Events we log but take no premium action on
const LOG_ONLY_EVENTS = new Set([
  "CANCELLATION",
  "BILLING_ISSUE",
  "SUBSCRIBER_ALIAS",
  "TRANSFER",
]);

// Sources that are protected from webhook downgrade
const PROTECTED_SOURCES = new Set(["manual", "permanent"]);

interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  aliases?: string[];
  product_id?: string;
  entitlement_ids?: string[];
  period_type?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  environment?: string;
  [key: string]: unknown;
}

interface WebhookPayload {
  api_version: string;
  event: RevenueCatEvent;
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify webhook authorization
  if (REVENUECAT_WEBHOOK_SECRET) {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== REVENUECAT_WEBHOOK_SECRET) {
      console.error("Unauthorized webhook request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("REVENUECAT_WEBHOOK_SECRET not set — skipping auth check");
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = payload.event;
  if (!event || !event.id || !event.type || !event.app_user_id) {
    return new Response(JSON.stringify({ error: "Missing required event fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`Processing event: ${event.type} (${event.id}) for user ${event.app_user_id}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Idempotency check: try to insert the event, skip if already exists
  const { error: insertError } = await supabase
    .from("revenuecat_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      app_user_id: event.app_user_id,
      product_id: event.product_id || null,
      entitlement_ids: event.entitlement_ids || null,
      period_type: event.period_type || null,
      purchased_at: event.purchased_at_ms
        ? new Date(event.purchased_at_ms).toISOString()
        : null,
      expiration_at: event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : null,
      payload: payload,
      action_taken: "pending",
    });

  if (insertError) {
    // Unique constraint violation = already processed
    if (insertError.code === "23505") {
      console.log(`Event ${event.id} already processed, skipping`);
      return new Response(
        JSON.stringify({ status: "ok", message: "Event already processed" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("Failed to insert event:", insertError);
    return new Response(JSON.stringify({ error: "Failed to log event" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // The app_user_id from RevenueCat is the profile ID (set during RevenueCat login)
  const profileId = event.app_user_id;
  let actionTaken = "logged_only";

  try {
    if (GRANT_EVENTS.has(event.type)) {
      // Grant premium
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          is_premium: true,
          premium_source: "revenuecat",
          premium_granted_at: new Date().toISOString(),
        })
        .eq("id", profileId);

      if (updateError) {
        console.error(`Failed to grant premium for ${profileId}:`, updateError);
        actionTaken = "grant_failed";
      } else {
        console.log(`Granted premium for ${profileId} (event: ${event.type})`);
        actionTaken = "premium_granted";
      }
    } else if (REVOKE_EVENTS.has(event.type)) {
      // Check current premium source before revoking
      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("is_premium, premium_source")
        .eq("id", profileId)
        .single();

      if (fetchError) {
        console.error(`Failed to fetch profile ${profileId}:`, fetchError);
        actionTaken = "revoke_fetch_failed";
      } else if (!profile) {
        console.warn(`Profile ${profileId} not found`);
        actionTaken = "profile_not_found";
      } else if (PROTECTED_SOURCES.has(profile.premium_source)) {
        // Never downgrade manual or permanent grants
        console.log(
          `Skipping revoke for ${profileId} — protected source: ${profile.premium_source}`
        );
        actionTaken = "revoke_skipped_protected";
      } else {
        // Safe to revoke: source is 'revenuecat' or null
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            is_premium: false,
            premium_source: null,
          })
          .eq("id", profileId);

        if (updateError) {
          console.error(`Failed to revoke premium for ${profileId}:`, updateError);
          actionTaken = "revoke_failed";
        } else {
          console.log(`Revoked premium for ${profileId} (event: ${event.type})`);
          actionTaken = "premium_revoked";
        }
      }
    } else if (LOG_ONLY_EVENTS.has(event.type)) {
      console.log(`Log-only event ${event.type} for ${profileId}`);
      actionTaken = "logged_only";
    } else {
      console.log(`Unhandled event type: ${event.type} for ${profileId}`);
      actionTaken = "unhandled_event_type";
    }
  } catch (err) {
    console.error(`Error processing event ${event.id}:`, err);
    actionTaken = "processing_error";
  }

  // Update the event record with the action taken
  await supabase
    .from("revenuecat_webhook_events")
    .update({ action_taken: actionTaken })
    .eq("event_id", event.id);

  return new Response(
    JSON.stringify({ status: "ok", action: actionTaken }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
    }
  );
});
