/** Mirrors app_private.normalize_phone() in the database (Egyptian numbers -> +20…). */
export function normalizePhone(input: string): string | null {
  let v = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^0-9+]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  else if (/^01[0125]\d{8}$/.test(v)) v = `+2${v}`;
  else if (/^201[0125]\d{8}$/.test(v)) v = `+${v}`;
  return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
}

/** +201012345678 -> 01012345678 for display; other countries unchanged. */
export function displayPhone(e164: string): string {
  return e164.startsWith("+20") ? `0${e164.slice(3)}` : e164;
}

export function whatsappLink(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}`;
}
