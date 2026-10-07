import { formatDateLong, formatTime } from "@/lib/time";

export type NotificationKind = "confirmation" | "reminder_24h" | "reminder_2h" | "rescheduled" | "cancellation";

export interface ClaimedNotification {
  id: string;
  kind: NotificationKind;
  to_phone: string;
  attempts: number;
  patient_name: string;
  clinic_name: string;
  clinic_phone: string | null;
  clinic_address: string | null;
  clinic_timezone: string;
  starts_at: string;
  manage_token: string;
  booking_ref: string;
}

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  language: string;
  appUrl: string;
  templates: Record<NotificationKind, string>;
}

export function whatsAppConfigFromEnv(env: NodeJS.ProcessEnv, appUrl: string): WhatsAppConfig | null {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return null;
  return {
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: env.WHATSAPP_API_VERSION || "v21.0",
    language: env.WHATSAPP_TEMPLATE_LANGUAGE || "ar",
    appUrl,
    templates: {
      confirmation: env.WHATSAPP_TEMPLATE_CONFIRMATION || "booking_confirmation",
      reminder_24h: env.WHATSAPP_TEMPLATE_REMINDER || "appointment_reminder",
      reminder_2h: env.WHATSAPP_TEMPLATE_REMINDER || "appointment_reminder",
      rescheduled: env.WHATSAPP_TEMPLATE_RESCHEDULED || "appointment_rescheduled",
      cancellation: env.WHATSAPP_TEMPLATE_CANCELLATION || "appointment_cancelled",
    },
  };
}

/**
 * Builds the Cloud API payload for an approved template.
 * Every template takes the same body variables, in this order:
 *   {{1}} patient name  {{2}} clinic name  {{3}} date  {{4}} time  {{5}} booking link
 * (the cancellation template uses {{1}}–{{4}} only).
 */
export function buildTemplatePayload(n: ClaimedNotification, cfg: WhatsAppConfig) {
  const params = [
    n.patient_name,
    n.clinic_name,
    formatDateLong(n.starts_at, n.clinic_timezone),
    formatTime(n.starts_at, n.clinic_timezone),
  ];
  if (n.kind !== "cancellation") {
    params.push(`${cfg.appUrl}/b/${n.manage_token}`);
  }
  return {
    messaging_product: "whatsapp",
    to: n.to_phone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: cfg.templates[n.kind],
      language: { code: cfg.language },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

export async function sendWhatsApp(
  n: ClaimedNotification,
  cfg: WhatsAppConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildTemplatePayload(n, cfg)),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const body = (await res.json().catch(() => null)) as
      | { messages?: { id: string }[]; error?: { message?: string; code?: number } }
      | null;
    if (!res.ok) {
      const err = body?.error;
      return { ok: false, error: `HTTP ${res.status}${err?.code ? ` (${err.code})` : ""}: ${err?.message ?? "unknown error"}` };
    }
    return { ok: true, messageId: body?.messages?.[0]?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
