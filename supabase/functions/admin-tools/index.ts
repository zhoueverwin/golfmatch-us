import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ADMIN_KEY =
  Deno.env.get("ADMIN_KEY") || "gm-global-admin-2026-s3cure-k3y";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
const badRequest = (msg: string) => json({ error: msg }, 400);
const unauthorized = () => json({ error: "unauthorized" }, 401);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  if ((url.searchParams.get("key") || "") !== ADMIN_KEY) return unauthorized();
  const action = url.searchParams.get("action") || "";
  try {
    switch (action) {
      case "inquiries":         return await listInquiries(url);
      case "reply":             return await replyToInquiry(await req.json());
      case "notify_user":       return await notifyUser(await req.json());
      case "notify_all":        return await notifyAll(await req.json());
      case "user_search":       return await userSearch(url);
      case "dashboard":         return await dashboard(url);
      case "moderation":        return await moderation();
      case "moderate":          return await moderate(await req.json());
      case "backfill_snapshots":return await backfillSnapshots(await req.json());
      case "kyc_review_list":   return await kycReviewList();
      case "kyc_review_decide": return await kycReviewDecide(await req.json());
      case "ping":              return json({ ok: true });
      default:                  return badRequest("unknown action");
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

async function listInquiries(url: URL) {
  const status = url.searchParams.get("status") || "open";
  let q = supabase.from("contact_inquiries").select(`id, user_id, subject, message, status, created_at, replied_at, profile:profiles!contact_inquiries_user_id_fkey(id, name, profile_pictures, gender, prefecture), replies:contact_replies(id, reply_message, from_admin, is_read, created_at)`).order("created_at", { ascending: false }).limit(200);
  if (status === "open")    q = q.eq("status", "open");
  if (status === "replied") q = q.eq("status", "replied");
  const { data, error } = await q;
  if (error) throw error;
  return json({ inquiries: data });
}

async function replyToInquiry(body: { inquiry_id?: string; message?: string }) {
  const { inquiry_id, message } = body;
  if (!inquiry_id || !message) return badRequest("inquiry_id and message required");
  const { data: inquiry, error: ie } = await supabase.from("contact_inquiries").select("id, user_id, subject").eq("id", inquiry_id).single();
  if (ie) throw ie;
  if (!inquiry) return badRequest("inquiry not found");
  const { error: re } = await supabase.from("contact_replies").insert({ inquiry_id, reply_message: message, from_admin: true, is_read: false });
  if (re) throw re;
  await supabase.from("contact_inquiries").update({ status: "replied", replied_at: new Date().toISOString() }).eq("id", inquiry_id);
  const preview = message.length > 140 ? message.slice(0, 137) + "..." : message;
  const { data: notifId, error: pe } = await supabase.rpc("send_push_notification", { p_user_id: inquiry.user_id, p_title: "Reply from support", p_body: preview, p_type: "contact_reply", p_data: { inquiry_id, screen: "ContactReply" } });
  if (pe) throw pe;
  return json({ ok: true, notification_id: notifId });
}

async function notifyUser(body: { user_id?: string; title?: string; body?: string; type?: string; data?: Record<string, unknown>; }) {
  const { user_id, title, body: messageBody, type, data } = body;
  if (!user_id || !title || !messageBody) return badRequest("user_id, title, body required");
  const { data: notifId, error } = await supabase.rpc("send_push_notification", { p_user_id: user_id, p_title: title, p_body: messageBody, p_type: type || "announcement", p_data: data || {} });
  if (error) throw error;
  return json({ ok: true, notification_id: notifId });
}

async function notifyAll(body: { title?: string; body?: string; target?: "all" | "male" | "female" | "verified"; dry_run?: boolean; }) {
  const { title, body: messageBody, target, dry_run } = body;
  if (!title || !messageBody) return badRequest("title and body required");
  let q = supabase.from("profiles").select("id").eq("is_banned", false).not("push_token", "is", null);
  if (target === "male" || target === "female") q = q.eq("gender", target);
  if (target === "verified") q = q.eq("is_verified", true);
  const { data: users, error } = await q;
  if (error) throw error;
  const recipients = users || [];
  if (dry_run) return json({ ok: true, would_send_to: recipients.length });
  let sent = 0, failed = 0;
  for (const u of recipients) {
    const { error: se } = await supabase.rpc("send_push_notification", { p_user_id: u.id, p_title: title, p_body: messageBody, p_type: "announcement", p_data: {} });
    if (se) failed++; else sent++;
  }
  return json({ ok: true, sent, failed, total: recipients.length });
}

async function userSearch(url: URL) {
  const qStr = (url.searchParams.get("q") || "").trim();
  if (qStr.length < 1) return json({ users: [] });
  let query = supabase.from("profiles").select("id, name, profile_pictures, gender, prefecture, push_token").eq("is_banned", false).limit(20);
  if (/^[0-9a-f-]{36}$/i.test(qStr)) query = query.eq("id", qStr);
  else query = query.ilike("name", `%${qStr.replace(/[,()]/g, "")}%`);
  const { data, error } = await query;
  if (error) throw error;
  return json({ users: (data || []).map((u: Record<string, unknown>) => ({ id: u.id, name: u.name, profile_pictures: u.profile_pictures, gender: u.gender, prefecture: u.prefecture, has_push_token: !!u.push_token })) });
}

async function dashboard(url: URL) {
  const days = Math.min(parseInt(url.searchParams.get("days") || "30", 10) || 30, 365);
  const todayStr = new Date().toISOString().slice(0, 10);
  await supabase.rpc("compute_daily_snapshot", { p_date: todayStr });
  const fromDate = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const { data: history, error: he } = await supabase.from("daily_snapshots").select("*").gte("snapshot_date", fromDate).order("snapshot_date", { ascending: true });
  if (he) throw he;
  const histArr = history || [];
  const today = histArr[histArr.length - 1] || null;
  const yesterday = histArr[histArr.length - 2] || null;
  const [totalUsers, completeProfiles, totalLikes, totalMatches, activeMatches, totalMessages, totalViews, totalPosts, totalReactions, genderCounts, ageDist, topPrefs, skillLevels, premiumTotal, premiumMale, premiumFemale, activeBasic, activePermanent, totalRevenue, monthRevenue, inquiriesToday, inquiriesYesterday, openInquiries, totalInquiries, pendingKyc, approvedKyc, pendingReports, totalBlocks, totalDeletions, deletionsThisWeek, churnedPremium, deletionReasons, avgDaysActive] = await Promise.all([
    countOf("profiles"), sb_count("profiles", (q) => q.not("name","is",null).gt("age",0).not("gender","is",null).not("prefecture","is",null)),
    countOf("user_likes"), countOf("matches"), sb_count("matches", (q) => q), countOf("messages"), countOf("profile_views"), countOf("posts"), countOf("post_reactions"),
    fetchGenderCounts(), fetchAgeDist(), fetchTopPrefectures(), fetchSkillLevels(),
    sb_count("profiles", (q) => q.eq("is_premium", true)),
    sb_count("profiles", (q) => q.eq("is_premium", true).eq("gender", "male")),
    sb_count("profiles", (q) => q.eq("is_premium", true).eq("gender", "female")),
    sb_count("memberships", (q) => q.eq("is_active", true).neq("plan_type", "permanent")),
    sb_count("memberships", (q) => q.eq("is_active", true).eq("plan_type", "permanent")),
    sumPrice(null), sumPrice(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    sb_count("contact_inquiries", (q) => q.gte("created_at", todayStr)),
    sb_count("contact_inquiries", (q) => q.gte("created_at", isoDate(-1)).lt("created_at", todayStr)),
    sb_count("contact_inquiries", (q) => q.eq("status", "open")), countOf("contact_inquiries"),
    sb_count("profiles", (q) => q.eq("kyc_status", "pending_review").is("kyc_admin_decided_at", null)),
    sb_count("profiles", (q) => q.eq("kyc_status", "approved")),
    sb_count("reports", (q) => q.eq("status", "pending")), countOf("user_blocks"),
    countOf("account_deletions"),
    sb_count("account_deletions", (q) => q.gte("deleted_at", isoDate(-7))),
    sb_count("account_deletions", (q) => q.eq("is_premium", true)),
    fetchDeletionReasons(), fetchAvgDaysActive(),
  ]);
  const premiumRate = totalUsers > 0 ? Math.round((premiumTotal / totalUsers) * 100) : 0;
  const matchRate = totalLikes > 0 ? Math.round((totalMatches / totalLikes) * 100) : 0;
  const avgMsg = totalMatches > 0 ? Math.round((totalMessages / totalMatches) * 10) / 10 : 0;
  const sources = await fetchPremiumSources();
  return json({ stats: { generated_at: new Date().toISOString().replace("T", " ").slice(0, 19), daily: { today: cardSlice(today, inquiriesToday), yesterday: cardSlice(yesterday, inquiriesYesterday) }, totals: { total_users: totalUsers, complete_profiles: completeProfiles, total_likes: totalLikes, total_super_likes: 0, total_passes: 0, total_matches: totalMatches, active_matches: activeMatches, total_messages: totalMessages, total_views: totalViews, total_posts: totalPosts, total_reactions: totalReactions, total_recruitments: 0 }, demographics: { gender: genderCounts, age_distribution: ageDist, top_prefectures: topPrefs, skill_levels: skillLevels }, premium: { total_premium: premiumTotal, premium_male: premiumMale, premium_female: premiumFemale, premium_rate_pct: premiumRate, active_basic: activeBasic, active_permanent: activePermanent, total_revenue: totalRevenue, revenue_this_month: monthRevenue, premium_by_source: sources }, engagement: { dau: today?.dau ?? 0, wau: today?.wau ?? 0, mau: today?.mau ?? 0, active_24h: today?.active_24h ?? 0, active_7d: today?.wau ?? 0, inactive_30d: Math.max(0, totalUsers - (today?.mau ?? 0)), match_rate_pct: matchRate, avg_messages_per_match: avgMsg }, churn: { total_deletions: totalDeletions, deletions_this_week: deletionsThisWeek, avg_days_active: avgDaysActive, churned_premium: churnedPremium, deletion_reasons: deletionReasons }, support: { open_inquiries: openInquiries, total_inquiries: totalInquiries, pending_kyc: pendingKyc, approved_kyc: approvedKyc, pending_reports: pendingReports, total_blocks: totalBlocks } }, history: histArr });
}
function cardSlice(row: Record<string, unknown> | null, inquiriesCount: number) { return { new_users: Number(row?.new_users ?? 0), matches: Number(row?.matches ?? 0), messages: Number(row?.messages ?? 0), likes: Number(row?.likes ?? 0), profile_views: Number(row?.profile_views ?? 0), inquiries: inquiriesCount, deletions: Number(row?.deletions ?? 0), posts: Number(row?.posts ?? 0) }; }
function isoDate(offsetDays: number) { return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10); }
async function countOf(table: string): Promise<number> { const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }); if (error) throw error; return count ?? 0; }
// deno-lint-ignore no-explicit-any
async function sb_count(table: string, build: (q: any) => any): Promise<number> { const base = supabase.from(table).select("*", { count: "exact", head: true }); const { count, error } = await build(base); if (error) throw error; return count ?? 0; }
async function fetchGenderCounts() { const [m, f, u] = await Promise.all([sb_count("profiles", (q) => q.eq("gender", "male")), sb_count("profiles", (q) => q.eq("gender", "female")), sb_count("profiles", (q) => q.is("gender", null))]); return { male: m, female: f, unknown: u }; }
async function fetchAgeDist() { const buckets = [{ label: "~24", min: 0, max: 24 }, { label: "25-29", min: 25, max: 29 }, { label: "30-34", min: 30, max: 34 }, { label: "35-39", min: 35, max: 39 }, { label: "40-49", min: 40, max: 49 }, { label: "50+", min: 50, max: 120 }]; const out: Record<string, number> = {}; for (const b of buckets) out[b.label] = await sb_count("profiles", (q) => q.gte("age", b.min).lte("age", b.max)); out["未設定"] = await sb_count("profiles", (q) => q.or("age.is.null,age.eq.0")); return out; }
async function fetchTopPrefectures() { const { data, error } = await supabase.from("profiles").select("prefecture").not("prefecture", "is", null); if (error) throw error; const counts: Record<string, number> = {}; for (const r of data || []) { const pref = (r as Record<string, string>).prefecture; if (!pref || pref === "Not set" || pref === "未設定") continue; counts[pref] = (counts[pref] || 0) + 1; } return Object.entries(counts).map(([prefecture, count]) => ({ prefecture, count })).sort((a, b) => b.count - a.count).slice(0, 10); }
async function fetchSkillLevels() { const { data, error } = await supabase.from("profiles").select("golf_skill_level"); if (error) throw error; const out: Record<string, number> = {}; for (const r of data || []) { const k = (r as Record<string, string>).golf_skill_level || "未設定"; out[k] = (out[k] || 0) + 1; } return out; }
async function sumPrice(sinceIso: string | null): Promise<number> { let q = supabase.from("memberships").select("price"); if (sinceIso) q = q.gte("purchase_date", sinceIso); const { data, error } = await q; if (error) throw error; return (data || []).reduce((sum: number, r: Record<string, number>) => sum + (Number(r.price) || 0), 0); }
async function fetchPremiumSources() { const { data, error } = await supabase.from("memberships").select("platform, plan_type").eq("is_active", true); if (error) throw error; const out = { revenuecat: 0, manual: 0, permanent: 0 }; for (const r of data || []) { const row = r as Record<string, string>; if (row.plan_type === "permanent") out.permanent++; else if (row.platform === "manual") out.manual++; else out.revenuecat++; } return out; }
async function fetchDeletionReasons() { const { data, error } = await supabase.from("account_deletions").select("reason_code"); if (error) throw error; const counts: Record<string, number> = {}; for (const r of data || []) { const k = (r as Record<string, string>).reason_code || "unknown"; counts[k] = (counts[k] || 0) + 1; } return Object.entries(counts).map(([reason_code, count]) => ({ reason_code, count })).sort((a, b) => b.count - a.count).slice(0, 10); }
async function fetchAvgDaysActive(): Promise<number | null> { const { data, error } = await supabase.from("account_deletions").select("days_active").not("days_active", "is", null); if (error) throw error; if (!data || data.length === 0) return null; const sum = data.reduce((s: number, r: Record<string, number>) => s + (Number(r.days_active) || 0), 0); return Math.round(sum / data.length); }

async function moderation() {
  const { data: reports, error: re } = await supabase.from("reports").select("reported_user_id, report_type, created_at");
  if (re) throw re;
  const { data: blocks, error: be } = await supabase.from("user_blocks").select("blocked_user_id, created_at");
  if (be) throw be;
  const buckets = new Map<string, { reports: string[]; report_count: number; block_count: number }>();
  for (const r of reports || []) { const id = (r as Record<string, string>).reported_user_id; if (!id) continue; const b = buckets.get(id) || { reports: [], report_count: 0, block_count: 0 }; b.report_count++; if ((r as Record<string, string>).report_type) b.reports.push((r as Record<string, string>).report_type); buckets.set(id, b); }
  for (const blk of blocks || []) { const id = (blk as Record<string, string>).blocked_user_id; if (!id) continue; const b = buckets.get(id) || { reports: [], report_count: 0, block_count: 0 }; b.block_count++; buckets.set(id, b); }
  const userIds = Array.from(buckets.keys());
  const profilesMap: Record<string, Record<string, unknown>> = {};
  if (userIds.length > 0) { const { data: profs, error: pe } = await supabase.from("profiles").select("id, name, gender, prefecture, profile_pictures, created_at, is_banned, is_verified, last_active_at").in("id", userIds); if (pe) throw pe; for (const p of profs || []) profilesMap[(p as Record<string, string>).id] = p as Record<string, unknown>; }
  const flagged = userIds.map((id) => { const b = buckets.get(id)!; const p = profilesMap[id]; if (!p) return null; const score = b.report_count * 10 + b.block_count * 5; return { user_id: id, user_name: p.name || "(unnamed)", gender: p.gender, prefecture: p.prefecture, is_banned: !!p.is_banned, is_verified: !!p.is_verified, created_at: p.created_at, score, reasons: [...Array.from(new Set(b.reports)).map((r) => `report: ${r}`), ...(b.block_count > 0 ? [`${b.block_count} block(s)`] : [])], activity: { likes_sent: null, messages_sent: null, matches: null } }; }).filter(Boolean).sort((a: { score: number } | null, b: { score: number } | null) => b!.score - a!.score).slice(0, 50);
  const { data: banned, error: be2 } = await supabase.from("profiles").select("id, name, gender, prefecture, profile_pictures, banned_at, ban_reason").eq("is_banned", true).order("banned_at", { ascending: false }).limit(100);
  if (be2) throw be2;
  const { data: log, error: le } = await supabase.from("moderation_log").select("*").order("created_at", { ascending: false }).limit(100);
  if (le) throw le;
  return json({ flagged, banned, log });
}

async function moderate(body: { action?: string; user_id?: string; reason?: string }) {
  const { action, user_id, reason } = body;
  if (!action || !user_id) return badRequest("action and user_id required");
  if (action !== "ban" && action !== "unban") return badRequest("action must be ban or unban");
  const updates = action === "ban" ? { is_banned: true, ban_reason: reason || null, banned_at: new Date().toISOString() } : { is_banned: false, ban_reason: null, banned_at: null };
  const { error: ue } = await supabase.from("profiles").update(updates).eq("id", user_id);
  if (ue) throw ue;
  await supabase.from("moderation_log").insert({ target_user_id: user_id, action, reason: reason || null, performed_by: "admin-tools" });
  return json({ ok: true });
}

async function backfillSnapshots(body: { days?: number }) {
  const days = Math.min(Math.max(body?.days || 90, 1), 365);
  const { data, error } = await supabase.rpc("backfill_daily_snapshots", { p_days: days });
  if (error) throw error;
  return json({ ok: true, days_computed: data });
}

// ============================================================ KYC REVIEW ====

// Queue: every user who clicked "Submit for manual review" (which flipped
// their kyc_status to pending_review) AND that the admin hasn't decided on
// yet. Images live on Didit; admin reviews there, decides here.
async function kycReviewList() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(`
      id, name, age, gender, prefecture, profile_pictures,
      kyc_status, kyc_attempt_count, kyc_admin_decided_at,
      is_banned, push_token, created_at, updated_at
    `)
    .eq("kyc_status", "pending_review")
    .is("kyc_admin_decided_at", null)
    .eq("is_banned", false)
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return json({
    submissions: (profiles || []).map((p: Record<string, unknown>) => ({
      ...p,
      has_push_token: !!p.push_token,
      push_token: undefined,
    })),
  });
}

async function kycReviewDecide(body: {
  user_id?: string;
  decision?: "approve" | "reject";
  notes?: string;
}) {
  const { user_id, decision, notes } = body;
  if (!user_id || !decision) return badRequest("user_id and decision required");
  if (decision !== "approve" && decision !== "reject")
    return badRequest("decision must be approve or reject");

  const now = new Date().toISOString();

  if (decision === "approve") {
    const { error } = await supabase.from("profiles").update({
      kyc_status: "approved",
      is_verified: true,
      kyc_verified_at: now,
      kyc_admin_decided_at: now,
      updated_at: now,
    }).eq("id", user_id);
    if (error) throw error;

    await supabase.rpc("send_push_notification", {
      p_user_id: user_id,
      p_title: "You're verified",
      p_body: "Your identity has been verified — welcome to Golfmatch!",
      p_type: "announcement",
      p_data: {},
    });
    return json({ ok: true, decision });
  }

  // Soft reject: bounce back to rejected status. Doesn't ban — use the
  // Moderation tab if you need to permanently lock the user out.
  // kyc_admin_decided_at is set so they're cleared from the queue; if they
  // retry Didit and fail again, the webhook bumps updated_at and they
  // re-enter the queue (since updated_at > kyc_admin_decided_at).
  const { error } = await supabase.from("profiles").update({
    kyc_status: "rejected",
    is_verified: false,
    kyc_verified_at: null,
    kyc_admin_decided_at: now,
    updated_at: now,
  }).eq("id", user_id);
  if (error) throw error;

  await supabase.rpc("send_push_notification", {
    p_user_id: user_id,
    p_title: "Verification update",
    p_body: notes || "We couldn't verify your identity. Please contact support if you believe this is a mistake.",
    p_type: "announcement",
    p_data: {},
  });
  return json({ ok: true, decision });
}
