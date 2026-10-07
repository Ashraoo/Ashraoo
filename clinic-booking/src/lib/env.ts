function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Public base URL used in WhatsApp links (no trailing slash). */
export const appUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
