import { describe, expect, it, vi } from "vitest";
import { addDays, dateIn, isValidDate, scalarRows, weekdayOf, zonedToUtc } from "@/lib/time";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { errorMessage } from "@/lib/errors";
import { buildTemplatePayload, sendWhatsApp, whatsAppConfigFromEnv, type ClaimedNotification } from "@/lib/whatsapp";

describe("time helpers", () => {
  it("adds days across month/year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("computes weekdays (0 = Sunday)", () => {
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(weekdayOf("2026-10-10")).toBe(6);
  });

  it("validates dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("nope")).toBe(false);
  });

  it("converts Cairo wall time to UTC, including summer time", () => {
    // Egypt: UTC+2 in winter, UTC+3 in summer (DST since 2023)
    expect(zonedToUtc("2026-01-15", "17:00", "Africa/Cairo").toISOString()).toBe("2026-01-15T15:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "17:00", "Africa/Cairo").toISOString()).toBe("2026-07-15T14:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "09:30", "Asia/Riyadh").toISOString()).toBe("2026-07-15T06:30:00.000Z");
  });

  it("gets the local calendar date of an instant", () => {
    expect(dateIn("2026-01-15T22:30:00Z", "Africa/Cairo")).toBe("2026-01-16");
    expect(dateIn("2026-01-15T21:30:00Z", "Africa/Cairo")).toBe("2026-01-15");
  });

  it("unwraps PostgREST scalar set results in both shapes", () => {
    expect(scalarRows<string>(["a", "b"], "fn")).toEqual(["a", "b"]);
    expect(scalarRows<string>([{ fn: "a" }], "fn")).toEqual(["a"]);
    expect(scalarRows<string>(null, "fn")).toEqual([]);
  });
});

describe("phone helpers", () => {
  it.each([
    ["01012345678", "+201012345678"],
    ["٠١٠١٢٣٤٥٦٧٨", "+201012345678"],
    ["+20 101 234 5678", "+201012345678"],
    ["00201012345678", "+201012345678"],
    ["201012345678", "+201012345678"],
    ["+966501234567", "+966501234567"],
    ["123", null],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("displays Egyptian numbers locally", () => {
    expect(displayPhone("+201012345678")).toBe("01012345678");
    expect(displayPhone("+966501234567")).toBe("+966501234567");
  });
});

describe("error messages", () => {
  it("maps database codes to Arabic", () => {
    expect(errorMessage({ message: "SLOT_UNAVAILABLE" })).toContain("الميعاد");
    expect(errorMessage({ message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"' })).toContain("الميعاد");
    expect(errorMessage(new Error("weird"))).toContain("مشكلة");
  });
});

describe("whatsapp", () => {
  const cfg = whatsAppConfigFromEnv(
    { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123" } as unknown as NodeJS.ProcessEnv,
    "https://app.example.com",
  )!;
  const n: ClaimedNotification = {
    id: "n1",
    kind: "reminder_24h",
    to_phone: "+201012345678",
    attempts: 1,
    patient_name: "محمد",
    clinic_name: "عيادة د. أحمد",
    clinic_phone: null,
    clinic_address: null,
    clinic_timezone: "Africa/Cairo",
    starts_at: "2026-01-15T15:00:00Z",
    manage_token: "a".repeat(40),
    booking_ref: "ABC123",
  };

  it("is disabled without credentials", () => {
    expect(whatsAppConfigFromEnv({} as NodeJS.ProcessEnv, "x")).toBeNull();
  });

  it("builds a template payload with the booking link", () => {
    const p = buildTemplatePayload(n, cfg);
    expect(p.to).toBe("201012345678");
    expect(p.template.name).toBe("appointment_reminder");
    expect(p.template.language.code).toBe("ar");
    const params = p.template.components[0].parameters.map((x) => x.text);
    expect(params).toHaveLength(5);
    expect(params[0]).toBe("محمد");
    expect(params[4]).toBe(`https://app.example.com/b/${"a".repeat(40)}`);
  });

  it("omits the link for cancellations", () => {
    const p = buildTemplatePayload({ ...n, kind: "cancellation" }, cfg);
    expect(p.template.name).toBe("appointment_cancelled");
    expect(p.template.components[0].parameters).toHaveLength(4);
  });

  it("reports success and API errors", async () => {
    const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }));
    expect(await sendWhatsApp(n, cfg, ok)).toEqual({ ok: true, messageId: "wamid.X" });
    expect(ok.mock.calls[0][0]).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect(ok.mock.calls[0][1].headers.Authorization).toBe("Bearer t");

    const bad = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100 } }), { status: 400 }));
    expect(await sendWhatsApp(n, cfg, bad)).toEqual({ ok: false, error: "HTTP 400 (100): Invalid parameter" });

    const boom = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await sendWhatsApp(n, cfg, boom)).toEqual({ ok: false, error: "network down" });
  });
});
