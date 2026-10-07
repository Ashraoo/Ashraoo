const MESSAGES: Record<string, string> = {
  SLOT_UNAVAILABLE: "الميعاد ده اتحجز أو مبقاش متاح. من فضلك اختار ميعاد تاني.",
  TOO_MANY_BOOKINGS: "عندك حجوزات قائمة بالفعل على الرقم ده. ألغي واحد منهم الأول أو كلم العيادة.",
  INVALID_NAME: "من فضلك اكتب الاسم بشكل صحيح.",
  INVALID_PHONE: "رقم الموبايل غير صحيح. اكتبه بالشكل ده: 01012345678",
  NOTES_TOO_LONG: "الملاحظات طويلة. اختصرها من فضلك.",
  CLINIC_NOT_FOUND: "العيادة دي مش موجودة أو الحجز فيها متوقف.",
  SERVICE_NOT_FOUND: "الخدمة دي مش متاحة.",
  CANNOT_MODIFY: "الحجز ده مينفعش يتعدل أو يتلغي دلوقتي.",
  SLUG_TAKEN: "الرابط ده مستخدم. اختار رابط تاني.",
  INVALID_CLINIC_DATA: "راجع البيانات: الاسم من حرفين على الأقل، والرابط حروف إنجليزي صغيرة وأرقام وشرطة (-) بس.",
  TOO_MANY_CLINICS: "وصلت للحد الأقصى من العيادات.",
  NOT_AUTHENTICATED: "لازم تسجل دخول الأول.",
  FORBIDDEN: "مش مسموح لك تعمل ده.",
  INVALID_STATUS_TRANSITION: "مينفعش تغيّر حالة الحجز بالشكل ده.",
  CANNOT_RESCHEDULE: "مينفعش تغيّر ميعاد حجز بعد ما المريض وصل.",
  START_REQUIRED: "اختار ميعاد الحجز.",
  START_IN_PAST: "الميعاد ده فات.",
  WORKING_HOURS_OVERLAP: "الفترة دي متداخلة مع فترة تانية في نفس اليوم.",
  LAST_OWNER: "لازم العيادة يفضل فيها مالك واحد على الأقل.",
  INVALID_TIMEZONE: "المنطقة الزمنية غير صحيحة.",
  PATIENT_NOT_IN_CLINIC: "المريض ده مش تابع للعيادة.",
};

/** Maps a Supabase/PostgREST error (or any thrown value) to an Arabic message. */
export function errorMessage(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  for (const code of Object.keys(MESSAGES)) {
    if (raw.includes(code)) return MESSAGES[code];
  }
  if (/appointments_no_overlap|exclusion constraint/i.test(raw)) return MESSAGES.SLOT_UNAVAILABLE;
  if (/duplicate key/i.test(raw)) return "البيانات دي موجودة بالفعل.";
  if (/row-level security|permission denied/i.test(raw)) return "مش مسموح لك تعمل ده.";
  if (/Invalid login credentials/i.test(raw)) return "الإيميل أو كلمة السر غلط.";
  if (/Email not confirmed/i.test(raw)) return "لازم تأكد الإيميل الأول. افتح الرسالة اللي وصلتك.";
  if (/User already registered/i.test(raw)) return "الإيميل ده عنده حساب بالفعل. سجل دخول.";
  if (/Password should be/i.test(raw)) return "كلمة السر لازم تكون 8 حروف على الأقل.";
  if (/fetch|network/i.test(raw)) return "مشكلة في الاتصال. جرب تاني.";
  return "حصلت مشكلة غير متوقعة. جرب تاني.";
}
