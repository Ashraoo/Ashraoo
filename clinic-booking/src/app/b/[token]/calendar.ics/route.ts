import { getPublicClient } from "@/lib/supabase/public";
import type { PublicBooking } from "@/lib/types";

export const dynamic = "force-dynamic";

function icsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40}$/.test(token)) return new Response("Not found", { status: 404 });
  const { data, error } = await getPublicClient().rpc("public_get_booking", { p_token: token });
  if (error) return new Response("Error", { status: 500 });
  if (!data) return new Response("Not found", { status: 404 });
  const b = data as PublicBooking;

  const summary = `${b.service_name ?? "ميعاد"} — ${b.clinic.name}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//clinic-booking//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.booking_ref}-${token.slice(0, 8)}@clinic-booking`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(b.starts_at)}`,
    `DTEND:${icsDate(b.ends_at)}`,
    `SUMMARY:${esc(summary)}`,
    b.clinic.address ? `LOCATION:${esc(b.clinic.address)}` : null,
    `DESCRIPTION:${esc(`حجز رقم ${b.booking_ref}`)}`,
    b.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${b.booking_ref}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
