/**
 * Database tests: run the real migration against a throwaway PostgreSQL database
 * (with a small Supabase stub for roles/auth) and exercise RLS, RPCs and triggers.
 *
 *   TEST_DATABASE_URL=postgres://postgres@localhost:54329/postgres npm run test:db
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const DB_NAME = "clinic_booking_test";
const root = join(__dirname, "..");

type Role = "anon" | "authenticated" | "service_role";
let db: Client;

async function as<T = Record<string, unknown>>(
  role: Role,
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    const res = await db.query(sql, params);
    await db.query("commit");
    return res.rows as T[];
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as T[];
}

async function createUser(email: string) {
  const [u] = await admin<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id",
    [email],
  );
  return u.id;
}

/** Local date (YYYY-MM-DD) in Cairo, `days` from today. */
async function cairoDate(days: number) {
  const [r] = await admin<{ d: string }>(
    "select to_char((now() at time zone 'Africa/Cairo')::date + $1::int, 'YYYY-MM-DD') as d",
    [days],
  );
  return r.d;
}

async function cairoTs(date: string, time: string) {
  const [r] = await admin<{ t: Date }>(
    "select (($1::date + $2::time) at time zone 'Africa/Cairo') as t",
    [date, time],
  );
  return r.t.toISOString();
}

const describeDb = ADMIN_URL ? describe : describe.skip;

describeDb("clinic booking database", () => {
  let ownerA: string, ownerB: string, recep: string;
  let clinicA: string, clinicB: string;
  let serviceA: string;
  let day: string; // a booking day 3 days from now

  beforeAll(async () => {
    const adminClient = new Client({ connectionString: ADMIN_URL });
    await adminClient.connect();
    await adminClient.query(`drop database if exists ${DB_NAME} with (force)`);
    await adminClient.query(`create database ${DB_NAME}`);
    await adminClient.end();

    const url = new URL(ADMIN_URL!);
    url.pathname = `/${DB_NAME}`;
    db = new Client({ connectionString: url.toString() });
    await db.connect();
    await db.query("set client_min_messages = error");
    await db.query(readFileSync(join(root, "supabase/tests/supabase_stub.sql"), "utf8"));
    await db.query(readFileSync(join(root, "supabase/migrations/20261007000000_init.sql"), "utf8"));

    ownerA = await createUser("owner-a@example.com");
    ownerB = await createUser("owner-b@example.com");
    recep = await createUser("recep@example.com");

    [{ create_clinic: clinicA }] = await as<{ create_clinic: string }>(
      "authenticated", ownerA,
      "select public.create_clinic('عيادة د. أحمد', 'dr-ahmed', 'د. أحمد', 'باطنة', '01000000000')",
    );
    [{ create_clinic: clinicB }] = await as<{ create_clinic: string }>(
      "authenticated", ownerB, "select public.create_clinic('Clinic B', 'clinic-b')",
    );

    // Deterministic schedule for clinic A: every day 09:00–11:00, 20-minute service.
    await as("authenticated", ownerA, "delete from public.working_hours where clinic_id = $1", [clinicA]);
    await as("authenticated", ownerA,
      `insert into public.working_hours (clinic_id, weekday, start_time, end_time)
       select $1, d, '09:00', '11:00' from generate_series(0, 6) d`, [clinicA]);
    [{ id: serviceA }] = await as<{ id: string }>("authenticated", ownerA,
      `insert into public.services (clinic_id, name, duration_minutes, price)
       values ($1, 'كشف تجريبي', 20, 300) returning id`, [clinicA]);
    day = await cairoDate(3);
  });

  afterAll(async () => {
    await db?.end();
  });

  describe("phone normalisation", () => {
    it.each([
      ["01012345678", "+201012345678"],
      ["٠١٠١٢٣٤٥٦٧٨", "+201012345678"],
      ["+20 101 234 5678", "+201012345678"],
      ["00201012345678", "+201012345678"],
      ["201012345678", "+201012345678"],
      ["+966501234567", "+966501234567"],
      ["123", null],
      ["", null],
    ])("%s -> %s", async (input, expected) => {
      const [r] = await admin<{ v: string | null }>("select app_private.normalize_phone($1) v", [input]);
      expect(r.v).toBe(expected);
    });
  });

  describe("onboarding", () => {
    it("creates defaults and the owner membership", async () => {
      const staff = await as("authenticated", ownerA, "select role from public.staff where clinic_id = $1", [clinicA]);
      expect(staff).toEqual([{ role: "owner" }]);
      const [{ n }] = await as<{ n: string }>("authenticated", ownerB,
        "select count(*) n from public.working_hours where clinic_id = $1", [clinicB]);
      expect(Number(n)).toBe(6);
    });

    it("rejects taken and invalid slugs", async () => {
      await expect(as("authenticated", ownerB, "select public.create_clinic('Clinic X', 'dr-ahmed')")).rejects.toThrow("SLUG_TAKEN");
      await expect(as("authenticated", ownerB, "select public.create_clinic('Clinic X', 'Bad Slug!')")).rejects.toThrow("INVALID_CLINIC_DATA");
      await expect(as("anon", null, "select public.create_clinic('Clinic X', 'anon-clinic')")).rejects.toThrow(/permission denied/);
    });
  });

  describe("public booking", () => {
    it("exposes only public clinic info to anon", async () => {
      const [{ c }] = await as<{ c: { name: string; services: { name: string }[] } }>(
        "anon", null, "select public.public_get_clinic('DR-AHMED') c");
      expect(c.name).toBe("عيادة د. أحمد");
      expect(c.services.map((s) => s.name)).toContain("كشف تجريبي");
      await expect(as("anon", null, "select * from public.patients")).rejects.toThrow(/permission denied/);
      await expect(as("anon", null, "select * from public.appointments")).rejects.toThrow(/permission denied/);
    });

    it("lists slots inside working hours that fit the service", async () => {
      const rows = await as<{ s: Date }>("anon", null,
        "select public.public_get_slots('dr-ahmed', $1, $2) s", [serviceA, day]);
      const expected = await Promise.all(
        ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30"].map((t) => cairoTs(day, t)),
      );
      expect(rows.map((r) => r.s.toISOString())).toEqual(expected);
    });

    it("books a slot, blocks overlapping slots and rejects double booking", async () => {
      const start = await cairoTs(day, "09:00");
      const [{ b }] = await as<{ b: { booking_ref: string; manage_token: string } }>("anon", null,
        "select public.public_book('dr-ahmed', $1, $2, '  محمد   علي ', '01011111111', 'ألم') b", [serviceA, start]);
      expect(b.manage_token).toHaveLength(40);
      expect(b.booking_ref).toMatch(/^[0-9A-F]{6}$/);

      const rows = await as<{ s: Date }>("anon", null,
        "select public.public_get_slots('dr-ahmed', $1, $2) s", [serviceA, day]);
      const slots = rows.map((r) => r.s.toISOString());
      expect(slots).not.toContain(start);
      expect(slots).not.toContain(await cairoTs(day, "09:15")); // overlaps 09:00–09:20
      expect(slots).toContain(await cairoTs(day, "09:30"));

      await expect(as("anon", null,
        "select public.public_book('dr-ahmed', $1, $2, 'آخر', '01022222222')", [serviceA, start]))
        .rejects.toThrow("SLOT_UNAVAILABLE");
      await expect(as("anon", null,
        "select public.public_book('dr-ahmed', $1, $2, 'آخر', '01022222222')", [serviceA, await cairoTs(day, "09:05")]))
        .rejects.toThrow("SLOT_UNAVAILABLE");

      const [appt] = await admin<{ contact_name: string; price: string; patient_notes: string }>(
        "select contact_name, price, patient_notes from public.appointments where booking_ref = $1", [b.booking_ref]);
      expect(appt).toEqual({ contact_name: "محمد علي", price: "300.00", patient_notes: "ألم" });
    });

    it("validates name and phone", async () => {
      const t = await cairoTs(day, "10:30");
      await expect(as("anon", null, "select public.public_book('dr-ahmed', $1, $2, 'م', '01011111111')", [serviceA, t]))
        .rejects.toThrow("INVALID_NAME");
      await expect(as("anon", null, "select public.public_book('dr-ahmed', $1, $2, 'محمد', '12')", [serviceA, t]))
        .rejects.toThrow("INVALID_PHONE");
    });

    it("limits active bookings per phone", async () => {
      await as("anon", null, "select public.public_book('dr-ahmed', $1, $2, 'محمد علي', '01011111111')",
        [serviceA, await cairoTs(day, "09:30")]);
      await expect(as("anon", null, "select public.public_book('dr-ahmed', $1, $2, 'محمد علي', '01011111111')",
        [serviceA, await cairoTs(day, "10:00")])).rejects.toThrow("TOO_MANY_BOOKINGS");
    });

    it("never overwrites an existing patient's name from the public page", async () => {
      const [p] = await admin<{ full_name: string }>(
        "select full_name from public.patients where clinic_id = $1 and phone = '+201011111111'", [clinicA]);
      expect(p.full_name).toBe("محمد علي");
    });

    it("queues confirmation and reminders", async () => {
      const rows = await admin<{ kind: string; status: string }>(
        `select n.kind, n.status from public.notifications n
           join public.appointments a on a.id = n.appointment_id
          where a.starts_at = $1 order by n.kind`, [await cairoTs(day, "09:00")]);
      expect(rows).toEqual([
        { kind: "confirmation", status: "pending" },
        { kind: "reminder_24h", status: "pending" },
        { kind: "reminder_2h", status: "pending" },
      ]);
    });
  });

  describe("manage booking by token", () => {
    let token: string;
    beforeAll(async () => {
      const [{ b }] = await as<{ b: { manage_token: string } }>("anon", null,
        "select public.public_book('dr-ahmed', $1, $2, 'سارة حسن', '01033333333') b",
        [serviceA, await cairoTs(day, "10:00")]);
      token = b.manage_token;
    });

    it("returns the booking and rejects wrong tokens", async () => {
      const [{ b }] = await as<{ b: { status: string; can_modify: boolean } }>("anon", null,
        "select public.public_get_booking($1) b", [token]);
      expect(b).toMatchObject({ status: "booked", can_modify: true });
      const [{ b: none }] = await as<{ b: unknown }>("anon", null, "select public.public_get_booking('x') b");
      expect(none).toBeNull();
    });

    it("reschedules, re-queueing notifications", async () => {
      const newStart = await cairoTs(day, "10:30");
      const reschedSlots = await as<{ s: Date }>("anon", null,
        "select public.public_get_reschedule_slots($1, $2) s", [token, day]);
      // its own current slot stays selectable
      expect(reschedSlots.map((r) => r.s.toISOString())).toContain(await cairoTs(day, "10:00"));

      const [{ b }] = await as<{ b: { starts_at: string } }>("anon", null,
        "select public.public_reschedule_booking($1, $2) b", [token, newStart]);
      expect(new Date(b.starts_at).toISOString()).toBe(newStart);

      const rows = await admin<{ kind: string; status: string }>(
        `select n.kind, n.status from public.notifications n join public.appointments a on a.id = n.appointment_id
          where a.manage_token = $1 order by n.created_at, n.kind`, [token]);
      expect(rows.filter((r) => r.status === "pending").map((r) => r.kind).sort())
        .toEqual(["reminder_24h", "reminder_2h", "rescheduled"]);
      expect(rows.filter((r) => r.status === "skipped").map((r) => r.kind).sort())
        .toEqual(["confirmation", "reminder_24h", "reminder_2h"]);
    });

    it("cancels, frees the slot and cannot be modified afterwards", async () => {
      const [{ b }] = await as<{ b: { status: string; can_modify: boolean } }>("anon", null,
        "select public.public_cancel_booking($1, null) b", [token]);
      expect(b).toMatchObject({ status: "cancelled", can_modify: false });
      const slots = await as<{ s: Date }>("anon", null,
        "select public.public_get_slots('dr-ahmed', $1, $2) s", [serviceA, day]);
      expect(slots.map((r) => r.s.toISOString())).toContain(await cairoTs(day, "10:30"));
      const kinds = await admin<{ kind: string }>(
        `select n.kind from public.notifications n join public.appointments a on a.id = n.appointment_id
          where a.manage_token = $1 and n.status = 'pending'`, [token]);
      expect(kinds).toEqual([{ kind: "cancellation" }]);
      await expect(as("anon", null, "select public.public_cancel_booking($1)", [token])).rejects.toThrow("CANNOT_MODIFY");
    });
  });

  describe("time off", () => {
    it("removes overlapping slots", async () => {
      const otherDay = await cairoDate(4);
      await as("authenticated", ownerA,
        "insert into public.time_off (clinic_id, starts_at, ends_at) values ($1, $2, $3)",
        [clinicA, await cairoTs(otherDay, "09:00"), await cairoTs(otherDay, "10:00")]);
      const rows = await as<{ s: Date }>("anon", null,
        "select public.public_get_slots('dr-ahmed', $1, $2) s", [serviceA, otherDay]);
      expect(rows.map((r) => r.s.toISOString())).toEqual(
        await Promise.all(["10:00", "10:15", "10:30"].map((t) => cairoTs(otherDay, t))));
    });

    it("returns nothing outside the booking window or in the past", async () => {
      const past = await as("anon", null, "select public.public_get_slots('dr-ahmed', $1, $2)", [serviceA, await cairoDate(-1)]);
      const far = await as("anon", null, "select public.public_get_slots('dr-ahmed', $1, $2)", [serviceA, await cairoDate(60)]);
      expect(past).toHaveLength(0);
      expect(far).toHaveLength(0);
    });
  });

  describe("staff access (RLS)", () => {
    it("isolates clinics from each other", async () => {
      const pats = await as("authenticated", ownerB, "select * from public.patients where clinic_id = $1", [clinicA]);
      expect(pats).toHaveLength(0);
      const upd = await as("authenticated", ownerB,
        "update public.appointments set notes = 'x' where clinic_id = $1 returning id", [clinicA]);
      expect(upd).toHaveLength(0);
      await expect(as("authenticated", ownerB, "select * from public.staff_create_appointment($1, 'X Y', '01044444444', $2, 'phone', now() + interval '1 day')", [clinicA, serviceA]))
        .rejects.toThrow("FORBIDDEN");
      await expect(as("authenticated", ownerB, "select public.staff_available_slots($1, $2, $3)", [clinicA, serviceA, day]))
        .rejects.toThrow("FORBIDDEN");
    });

    it("invites a receptionist who can run the front desk but not settings", async () => {
      await as("authenticated", ownerA,
        "insert into public.clinic_invites (clinic_id, email, role, invited_by) values ($1, 'recep@example.com', 'receptionist', $2)",
        [clinicA, ownerA]);
      await expect(as("authenticated", recep,
        "insert into public.clinic_invites (clinic_id, email, role, invited_by) values ($1, 'z@example.com', 'doctor', $2)",
        [clinicA, recep])).rejects.toThrow(/row-level security/);

      const [{ accept_invites: n }] = await as<{ accept_invites: number }>("authenticated", recep, "select public.accept_invites()");
      expect(n).toBe(1);

      const upd = await as("authenticated", recep,
        "update public.services set price = 1 where clinic_id = $1 returning id", [clinicA]);
      expect(upd).toHaveLength(0);
      const visible = await as("authenticated", recep, "select id from public.patients where clinic_id = $1", [clinicA]);
      expect(visible.length).toBeGreaterThan(0);
    });

    it("lets staff book by phone and enforces no overlap", async () => {
      const t = await cairoTs(await cairoDate(5), "09:00");
      const [a] = await as<{ status: string; source: string; created_by: string }>("authenticated", recep,
        "select * from public.staff_create_appointment($1, 'كريم سمير', '01055555555', $2, 'phone', $3)", [clinicA, serviceA, t]);
      expect(a).toMatchObject({ status: "booked", source: "phone", created_by: recep });
      await expect(as("authenticated", recep,
        "select * from public.staff_create_appointment($1, 'منى', '01066666666', $2, 'phone', $3::timestamptz + interval '10 minutes')", [clinicA, serviceA, t]))
        .rejects.toThrow("SLOT_UNAVAILABLE");
    });

    it("walk-ins join the queue without reserving a slot", async () => {
      const [w] = await as<{ status: string; arrived_at: Date | null }>("authenticated", recep,
        "select * from public.staff_create_appointment($1, 'زائر', '01077777777', $2, 'walk_in')", [clinicA, serviceA]);
      expect(w.status).toBe("arrived");
      expect(w.arrived_at).not.toBeNull();
      const [w2] = await as<{ status: string }>("authenticated", recep,
        "select * from public.staff_create_appointment($1, 'زائر تاني', '01088888888', $2, 'walk_in')", [clinicA, serviceA]);
      expect(w2.status).toBe("arrived");
      const notifs = await admin("select 1 from public.notifications n join public.appointments a on a.id = n.appointment_id where a.source = 'walk_in'");
      expect(notifs).toHaveLength(0);
    });

    it("enforces the status workflow and protects tokens", async () => {
      const [a] = await admin<{ id: string }>(
        "select id from public.appointments where clinic_id = $1 and source = 'phone' limit 1", [clinicA]);
      await as("authenticated", recep, "update public.appointments set status = 'arrived' where id = $1", [a.id]);
      await expect(as("authenticated", recep, "update public.appointments set status = 'no_show' where id = $1", [a.id]))
        .rejects.toThrow("INVALID_STATUS_TRANSITION");
      await as("authenticated", recep, "update public.appointments set status = 'in_progress' where id = $1", [a.id]);
      await as("authenticated", recep, "update public.appointments set status = 'completed' where id = $1", [a.id]);
      const [row] = await admin<{ arrived_at: Date; completed_at: Date }>(
        "select arrived_at, completed_at from public.appointments where id = $1", [a.id]);
      expect(row.arrived_at).toBeInstanceOf(Date);
      expect(row.completed_at).toBeInstanceOf(Date);
      await expect(as("authenticated", recep, "update public.appointments set manage_token = 'x' where id = $1", [a.id]))
        .rejects.toThrow(/permission denied/);
      await expect(as("authenticated", recep, "update public.appointments set starts_at = now() where id = $1", [a.id]))
        .rejects.toThrow("CANNOT_RESCHEDULE");
    });

    it("records payments and shows them in the day schedule", async () => {
      const date = await cairoDate(5);
      const [a] = await admin<{ id: string }>(
        "select id from public.appointments where clinic_id = $1 and source = 'phone' limit 1", [clinicA]);
      await as("authenticated", recep,
        "insert into public.payments (clinic_id, appointment_id, amount, method, received_by) values ($1, $2, 200, 'cash', $3)",
        [clinicA, a.id, recep]);
      await expect(as("authenticated", recep,
        "insert into public.payments (clinic_id, appointment_id, amount, method, received_by) values ($1, $2, 1, 'cash', $3)",
        [clinicA, a.id, ownerA])).rejects.toThrow(/row-level security/);

      const rows = await as<{ id: string; paid: string; patient_name: string }>("authenticated", recep,
        "select * from public.staff_day_schedule($1, $2)", [clinicA, date]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: a.id, paid: "200.00", patient_name: "كريم سمير" });
      const other = await as("authenticated", ownerB, "select * from public.staff_day_schedule($1, $2)", [clinicA, date]);
      expect(other).toHaveLength(0);
    });

    it("rejects overlapping working hours", async () => {
      await expect(as("authenticated", ownerA,
        "insert into public.working_hours (clinic_id, weekday, start_time, end_time) values ($1, 1, '10:00', '12:00')", [clinicA]))
        .rejects.toThrow("WORKING_HOURS_OVERLAP");
    });

    it("keeps at least one owner but allows deleting the clinic", async () => {
      await expect(as("authenticated", ownerB, "delete from public.staff where user_id = $1", [ownerB]))
        .rejects.toThrow("LAST_OWNER");
      await admin("delete from public.clinics where id = $1", [clinicB]);
      const [{ n }] = await admin<{ n: string }>("select count(*) n from public.staff where clinic_id = $1", [clinicB]);
      expect(Number(n)).toBe(0);
    });
  });

  describe("notification worker", () => {
    it("is callable only by the service role", async () => {
      await expect(as("authenticated", ownerA, "select * from public.claim_notifications(10)")).rejects.toThrow(/permission denied/);
      await expect(as("anon", null, "select * from public.claim_notifications(10)")).rejects.toThrow(/permission denied/);
    });

    it("claims due messages once, retries with backoff and marks success", async () => {
      const claimed = await as<{ id: string; kind: string; patient_name: string; manage_token: string }>(
        "service_role", null, "select * from public.claim_notifications(50)");
      expect(claimed.length).toBeGreaterThan(0);
      expect(claimed.every((c) => ["confirmation", "cancellation", "rescheduled"].includes(c.kind))).toBe(true);
      const again = await as("service_role", null, "select * from public.claim_notifications(50)");
      expect(again).toHaveLength(0);

      const [first, second] = claimed;
      await as("service_role", null, "select public.complete_notification($1, true, null, 'wamid.1')", [first.id]);
      await as("service_role", null, "select public.complete_notification($1, false, 'boom')", [second.id]);
      const rows = await admin<{ id: string; status: string; send_at: Date; last_error: string | null }>(
        "select id, status, send_at, last_error from public.notifications where id = any($1)", [[first.id, second.id]]);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[first.id].status).toBe("sent");
      expect(byId[second.id]).toMatchObject({ status: "pending", last_error: "boom" });
      expect(byId[second.id].send_at.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
