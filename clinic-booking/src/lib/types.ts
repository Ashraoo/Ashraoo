export type AppointmentStatus =
  | "booked"
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type AppointmentSource = "online" | "phone" | "walk_in";
export type StaffRole = "owner" | "doctor" | "receptionist";
export type PaymentMethod = "cash" | "card" | "instapay" | "wallet" | "other";

export interface PublicService {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
}

export interface PublicClinic {
  id: string;
  slug: string;
  name: string;
  doctor_name: string | null;
  specialty: string | null;
  phone: string | null;
  address: string | null;
  about: string | null;
  timezone: string;
  booking_window_days: number;
  today: string; // YYYY-MM-DD in the clinic's timezone
  working_days: number[];
  services: PublicService[];
}

export interface PublicBooking {
  booking_ref: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  contact_name: string;
  service_id: string | null;
  service_name: string | null;
  price: number;
  can_modify: boolean;
  clinic: {
    slug: string;
    name: string;
    doctor_name: string | null;
    phone: string | null;
    address: string | null;
    timezone: string;
    today: string;
    booking_window_days: number;
  };
}

export interface Clinic {
  id: string;
  slug: string;
  name: string;
  doctor_name: string | null;
  specialty: string | null;
  phone: string | null;
  address: string | null;
  about: string | null;
  timezone: string;
  slot_interval_minutes: number;
  booking_window_days: number;
  min_notice_minutes: number;
  max_active_bookings_per_phone: number;
  is_published: boolean;
  reminders_enabled: boolean;
}

export interface Service {
  id: string;
  clinic_id: string;
  name: string;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
}

export interface WorkingHour {
  id: string;
  clinic_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface TimeOff {
  id: string;
  clinic_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface StaffMember {
  clinic_id: string;
  user_id: string;
  role: StaffRole;
  display_name: string | null;
}

export interface Invite {
  id: string;
  email: string;
  role: Exclude<StaffRole, "owner">;
  accepted_at: string | null;
  created_at: string;
}

export interface ScheduleRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  booking_ref: string;
  contact_name: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  service_id: string | null;
  service_name: string | null;
  price: number;
  paid: number;
  notes: string | null;
  patient_notes: string | null;
  arrived_at: string | null;
}

export interface Patient {
  id: string;
  full_name: string;
  phone: string;
  notes: string | null;
  created_at: string;
}
