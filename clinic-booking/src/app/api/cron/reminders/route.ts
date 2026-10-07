import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/env";
import { sendWhatsApp, whatsAppConfigFromEnv, type ClaimedNotification } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 20;
const TIME_BUDGET_MS = 45_000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Sends due WhatsApp messages. Called by Vercel Cron (see vercel.json) or any scheduler. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = whatsAppConfigFromEnv(process.env, appUrl());
  if (!cfg) {
    return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 503 });
  }

  const supabase = getAdminClient();
  const started = Date.now();
  let sent = 0;
  let failed = 0;

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data, error } = await supabase.rpc("claim_notifications", { p_limit: BATCH });
    if (error) {
      return NextResponse.json({ error: error.message, sent, failed }, { status: 500 });
    }
    const batch = (data ?? []) as ClaimedNotification[];
    if (batch.length === 0) break;

    const results = await Promise.all(batch.map((n) => sendWhatsApp(n, cfg)));
    for (const [i, n] of batch.entries()) {
      const r = results[i];
      const { error: completeError } = await supabase.rpc("complete_notification", {
        p_id: n.id,
        p_success: r.ok,
        p_error: r.ok ? null : r.error,
        p_provider_message_id: r.ok ? r.messageId : null,
      });
      if (completeError) {
        // The row stays in 'sending' and is recovered automatically after 10 minutes.
        console.error("complete_notification failed", n.id, completeError.message);
      }
      if (r.ok) sent++;
      else failed++;
    }
    if (batch.length < BATCH) break;
  }

  return NextResponse.json({ sent, failed });
}
