-- =====================================================================
-- Clinic booking — MVP schema
-- Multi-tenant: every row belongs to a clinic; staff see only their clinic.
-- Patients never touch tables directly: they use SECURITY DEFINER RPCs.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Normalises Egyptian / international numbers to E.164 (+20...).
create or replace function app_private.normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_phone is null then
    return null;
  end if;
  -- Arabic-Indic and Persian digits -> ASCII
  v := translate(p_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  v := regexp_replace(v, '[^0-9+]', '', 'g');
  if v like '00%' then
    v := '+' || substr(v, 3);
  elsif v ~ '^01[0125][0-9]{8}$' then
    v := '+2' || v;               -- 01xxxxxxxxx -> +201xxxxxxxxx
  elsif v ~ '^201[0125][0-9]{8}$' then
    v := '+' || v;
  end if;
  if v !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;
  return v;
end;
$$;

create or replace function app_private.random_token(p_len int)
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, p_len);
$$;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.clinics (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                        check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name                  text not null check (length(btrim(name)) between 2 and 120),
  doctor_name           text check (length(doctor_name) <= 120),
  specialty             text check (length(specialty) <= 120),
  phone                 text check (length(phone) <= 30),
  address               text check (length(address) <= 300),
  about                 text check (length(about) <= 1000),
  timezone              text not null default 'Africa/Cairo',
  slot_interval_minutes int  not null default 15 check (slot_interval_minutes between 5 and 120),
  booking_window_days   int  not null default 30 check (booking_window_days between 1 and 180),
  min_notice_minutes    int  not null default 60 check (min_notice_minutes between 0 and 10080),
  max_active_bookings_per_phone int not null default 2 check (max_active_bookings_per_phone between 1 and 20),
  is_published          boolean not null default true,
  reminders_enabled     boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.staff (
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'doctor', 'receptionist')),
  display_name text check (length(display_name) <= 120),
  created_at   timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index staff_user_idx on public.staff (user_id);

create table public.clinic_invites (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        text not null check (role in ('doctor', 'receptionist')),
  invited_by  uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (clinic_id, email)
);
create index clinic_invites_email_idx on public.clinic_invites (email) where accepted_at is null;

create table public.services (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 120),
  duration_minutes int  not null check (duration_minutes between 5 and 480),
  price            numeric(10, 2) not null default 0 check (price >= 0),
  is_active        boolean not null default true,
  is_public        boolean not null default true,   -- bookable from the public page
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);
create index services_clinic_idx on public.services (clinic_id);

create table public.working_hours (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),  -- 0 = Sunday (extract(dow))
  start_time time not null,
  end_time   time not null,
  check (start_time < end_time)
);
create index working_hours_clinic_idx on public.working_hours (clinic_id, weekday);

create table public.time_off (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text check (length(reason) <= 200),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index time_off_clinic_idx on public.time_off (clinic_id, starts_at);

create table public.patients (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) between 2 and 120),
  phone      text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  notes      text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (clinic_id, phone)
);

create table public.appointments (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete restrict,
  service_id    uuid references public.services(id) on delete set null,
  contact_name  text not null check (length(btrim(contact_name)) between 2 and 120),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'booked'
                check (status in ('booked', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show')),
  source        text not null default 'online' check (source in ('online', 'phone', 'walk_in')),
  price         numeric(10, 2) not null default 0 check (price >= 0),
  notes         text check (length(notes) <= 1000),          -- staff notes
  patient_notes text check (length(patient_notes) <= 500),   -- written by the patient
  booking_ref   text not null,
  manage_token  text not null unique,
  arrived_at    timestamptz,
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text check (length(cancel_reason) <= 300),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (starts_at < ends_at),
  unique (clinic_id, booking_ref),
  -- No two slot-holding appointments may overlap in the same clinic.
  -- Walk-ins join the queue and do not reserve a slot.
  constraint appointments_no_overlap exclude using gist (
    clinic_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show') and source <> 'walk_in')
);
create index appointments_clinic_start_idx on public.appointments (clinic_id, starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at desc);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  amount         numeric(10, 2) not null check (amount > 0),
  method         text not null check (method in ('cash', 'card', 'instapay', 'wallet', 'other')),
  note           text check (length(note) <= 300),
  received_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index payments_appointment_idx on public.payments (appointment_id);
create index payments_clinic_created_idx on public.payments (clinic_id, created_at);

create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,
  appointment_id      uuid not null references public.appointments(id) on delete cascade,
  kind                text not null check (kind in ('confirmation', 'reminder_24h', 'reminder_2h', 'rescheduled', 'cancellation')),
  channel             text not null default 'whatsapp' check (channel in ('whatsapp')),
  to_phone            text not null,
  send_at             timestamptz not null,
  status              text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts            int not null default 0,
  locked_at           timestamptz,
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index notifications_due_idx on public.notifications (send_at) where status = 'pending';
create index notifications_appointment_idx on public.notifications (appointment_id);
create unique index notifications_one_open_per_kind
  on public.notifications (appointment_id, kind) where status in ('pending', 'sending');

create trigger clinics_updated_at before update on public.clinics
  for each row execute function app_private.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------

create or replace function app_private.validate_clinic()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end if;
  new.slug := lower(new.slug);
  return new;
end;
$$;
create trigger clinics_validate before insert or update on public.clinics
  for each row execute function app_private.validate_clinic();

create or replace function app_private.validate_working_hours()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.working_hours w
    where w.clinic_id = new.clinic_id
      and w.weekday = new.weekday
      and w.id <> new.id
      and w.start_time < new.end_time
      and new.start_time < w.end_time
  ) then
    raise exception 'WORKING_HOURS_OVERLAP' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger working_hours_validate before insert or update on public.working_hours
  for each row execute function app_private.validate_working_hours();

-- Keeps the clinic with at least one owner.
create or replace function app_private.protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.staff s
       where s.clinic_id = old.clinic_id and s.role = 'owner' and s.user_id <> old.user_id
     )
     -- allow the cascade when the whole clinic is being deleted
     and exists (select 1 from public.clinics c where c.id = old.clinic_id)
  then
    raise exception 'LAST_OWNER' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger staff_protect_last_owner before update or delete on public.staff
  for each row execute function app_private.protect_last_owner();

-- Appointment lifecycle: allowed transitions, timestamps, immutable columns.
create or replace function app_private.appointment_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[];
begin
  if new.clinic_id <> old.clinic_id
     or new.manage_token <> old.manage_token
     or new.booking_ref <> old.booking_ref
     or new.created_at <> old.created_at then
    raise exception 'IMMUTABLE_COLUMN' using errcode = '42501';
  end if;

  if new.patient_id <> old.patient_id and not exists (
    select 1 from public.patients p where p.id = new.patient_id and p.clinic_id = new.clinic_id
  ) then
    raise exception 'PATIENT_NOT_IN_CLINIC' using errcode = '23503';
  end if;

  if new.status <> old.status then
    allowed := case old.status
      when 'booked'      then array['confirmed', 'arrived', 'cancelled', 'no_show']
      when 'confirmed'   then array['booked', 'arrived', 'cancelled', 'no_show']
      when 'arrived'     then array['in_progress', 'completed', 'booked', 'cancelled']
      when 'in_progress' then array['completed', 'arrived']
      when 'completed'   then array['in_progress']
      when 'no_show'     then array['booked']
      else array[]::text[]
    end;
    if not (new.status = any (allowed)) then
      raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023',
        detail = format('%s -> %s', old.status, new.status);
    end if;

    if new.status = 'arrived' and old.status <> 'in_progress' then
      new.arrived_at := now();
    elsif new.status in ('booked', 'confirmed') then
      new.arrived_at := null;
    end if;
    if new.status = 'in_progress' and new.arrived_at is null then
      new.arrived_at := now();
    end if;
    new.completed_at := case when new.status = 'completed' then now() end;
    if new.status = 'cancelled' then
      new.cancelled_at := now();
    end if;
  end if;

  -- Moving an appointment keeps its duration unless ends_at is set explicitly.
  if new.starts_at <> old.starts_at and new.ends_at = old.ends_at then
    new.ends_at := new.starts_at + (old.ends_at - old.starts_at);
  end if;
  if (new.starts_at <> old.starts_at or new.ends_at <> old.ends_at)
     and new.status not in ('booked', 'confirmed') then
    raise exception 'CANNOT_RESCHEDULE' using errcode = '22023';
  end if;

  return new;
end;
$$;
create trigger appointments_before_update before update on public.appointments
  for each row execute function app_private.appointment_before_update();

create or replace function app_private.appointment_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.patients p where p.id = new.patient_id and p.clinic_id = new.clinic_id
  ) then
    raise exception 'PATIENT_NOT_IN_CLINIC' using errcode = '23503';
  end if;
  if new.service_id is not null and not exists (
    select 1 from public.services s where s.id = new.service_id and s.clinic_id = new.clinic_id
  ) then
    raise exception 'SERVICE_NOT_IN_CLINIC' using errcode = '23503';
  end if;
  if new.status not in ('booked', 'confirmed', 'arrived') then
    raise exception 'INVALID_INITIAL_STATUS' using errcode = '22023';
  end if;
  if new.status = 'arrived' then
    new.arrived_at := coalesce(new.arrived_at, now());
  end if;
  new.manage_token := app_private.random_token(40);
  new.booking_ref  := upper(app_private.random_token(6));
  new.created_at   := now();
  return new;
end;
$$;
create trigger appointments_before_insert before insert on public.appointments
  for each row execute function app_private.appointment_before_insert();

-- ---------------------------------------------------------------------
-- WhatsApp notification queue
-- ---------------------------------------------------------------------

create or replace function app_private.enqueue_notification(
  p_appt public.appointments, p_kind text, p_send_at timestamptz
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_phone text;
begin
  select phone into v_phone from public.patients where id = p_appt.patient_id;
  insert into public.notifications (clinic_id, appointment_id, kind, to_phone, send_at)
  values (p_appt.clinic_id, p_appt.id, p_kind, v_phone, p_send_at)
  on conflict (appointment_id, kind) where status in ('pending', 'sending')
  do update set send_at = excluded.send_at, to_phone = excluded.to_phone, status = 'pending',
                attempts = 0, last_error = null, locked_at = null;
end;
$$;

create or replace function app_private.enqueue_reminders(p_appt public.appointments)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_appt.starts_at - interval '24 hours' > now() + interval '1 hour' then
    perform app_private.enqueue_notification(p_appt, 'reminder_24h', p_appt.starts_at - interval '24 hours');
  end if;
  if p_appt.starts_at - interval '2 hours' > now() + interval '15 minutes' then
    perform app_private.enqueue_notification(p_appt, 'reminder_2h', p_appt.starts_at - interval '2 hours');
  end if;
end;
$$;

create or replace function app_private.appointment_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
begin
  select reminders_enabled into v_enabled from public.clinics where id = new.clinic_id;
  if new.source = 'walk_in' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if v_enabled and new.status in ('booked', 'confirmed') and new.starts_at > now() then
      perform app_private.enqueue_notification(new, 'confirmation', now());
      perform app_private.enqueue_reminders(new);
    end if;
    return null;
  end if;

  -- UPDATE
  if new.status in ('cancelled', 'no_show', 'completed', 'arrived', 'in_progress')
     and old.status is distinct from new.status then
    update public.notifications
       set status = 'skipped', last_error = 'appointment ' || new.status
     where appointment_id = new.id and status = 'pending';
    if v_enabled and new.status = 'cancelled' and new.starts_at > now() then
      perform app_private.enqueue_notification(new, 'cancellation', now());
    end if;
  elsif new.starts_at <> old.starts_at and new.status in ('booked', 'confirmed') then
    update public.notifications
       set status = 'skipped', last_error = 'appointment rescheduled'
     where appointment_id = new.id and status = 'pending';
    if v_enabled and new.starts_at > now() then
      perform app_private.enqueue_notification(new, 'rescheduled', now());
      perform app_private.enqueue_reminders(new);
    end if;
  elsif new.status in ('booked', 'confirmed') and old.status in ('no_show', 'arrived') then
    -- undo of a mistaken status change: restore future reminders
    if v_enabled and new.starts_at > now() then
      perform app_private.enqueue_reminders(new);
    end if;
  end if;
  return null;
end;
$$;
create trigger appointments_notifications
  after insert or update of status, starts_at on public.appointments
  for each row execute function app_private.appointment_notifications();

-- ---------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER avoids RLS recursion on staff)
-- ---------------------------------------------------------------------

create or replace function app_private.is_member(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where clinic_id = p_clinic_id and user_id = (select auth.uid())
  );
$$;

create or replace function app_private.has_role(p_clinic_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where clinic_id = p_clinic_id and user_id = (select auth.uid()) and role = any (p_roles)
  );
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default,
-- so internal functions must be revoked from those roles explicitly.
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.is_member(uuid) to authenticated;
grant execute on function app_private.has_role(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.clinics        enable row level security;
alter table public.staff          enable row level security;
alter table public.clinic_invites enable row level security;
alter table public.services       enable row level security;
alter table public.working_hours  enable row level security;
alter table public.time_off       enable row level security;
alter table public.patients       enable row level security;
alter table public.appointments   enable row level security;
alter table public.payments       enable row level security;
alter table public.notifications  enable row level security;

-- Anonymous visitors only use the public_* RPCs.
revoke all on all tables in schema public from anon;

create policy clinics_select on public.clinics for select to authenticated
  using (app_private.is_member(id));
create policy clinics_update on public.clinics for update to authenticated
  using (app_private.has_role(id, array['owner'])) with check (app_private.has_role(id, array['owner']));

create policy staff_select on public.staff for select to authenticated
  using (app_private.is_member(clinic_id));
create policy staff_update on public.staff for update to authenticated
  using (app_private.has_role(clinic_id, array['owner'])) with check (app_private.has_role(clinic_id, array['owner']));
create policy staff_delete on public.staff for delete to authenticated
  using (app_private.has_role(clinic_id, array['owner']));
-- staff rows are inserted only by create_clinic() / accept_invites()

create policy invites_select on public.clinic_invites for select to authenticated
  using (app_private.has_role(clinic_id, array['owner']));
create policy invites_insert on public.clinic_invites for insert to authenticated
  with check (app_private.has_role(clinic_id, array['owner']) and invited_by = (select auth.uid()));
create policy invites_delete on public.clinic_invites for delete to authenticated
  using (app_private.has_role(clinic_id, array['owner']));

-- Clinic configuration: readable by all staff, editable by owners.
create policy services_select on public.services for select to authenticated
  using (app_private.is_member(clinic_id));
create policy services_write on public.services for all to authenticated
  using (app_private.has_role(clinic_id, array['owner'])) with check (app_private.has_role(clinic_id, array['owner']));

create policy working_hours_select on public.working_hours for select to authenticated
  using (app_private.is_member(clinic_id));
create policy working_hours_write on public.working_hours for all to authenticated
  using (app_private.has_role(clinic_id, array['owner'])) with check (app_private.has_role(clinic_id, array['owner']));

create policy time_off_select on public.time_off for select to authenticated
  using (app_private.is_member(clinic_id));
create policy time_off_write on public.time_off for all to authenticated
  using (app_private.has_role(clinic_id, array['owner', 'doctor'])) with check (app_private.has_role(clinic_id, array['owner', 'doctor']));

-- Operational data: any staff member.
create policy patients_select on public.patients for select to authenticated
  using (app_private.is_member(clinic_id));
create policy patients_insert on public.patients for insert to authenticated
  with check (app_private.is_member(clinic_id));
create policy patients_update on public.patients for update to authenticated
  using (app_private.is_member(clinic_id)) with check (app_private.is_member(clinic_id));

create policy appointments_select on public.appointments for select to authenticated
  using (app_private.is_member(clinic_id));
create policy appointments_update on public.appointments for update to authenticated
  using (app_private.is_member(clinic_id)) with check (app_private.is_member(clinic_id));
-- inserts go through staff_create_appointment() / public_book()

create policy payments_select on public.payments for select to authenticated
  using (app_private.is_member(clinic_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (
    app_private.is_member(clinic_id)
    and received_by = (select auth.uid())
    and exists (select 1 from public.appointments a where a.id = appointment_id and a.clinic_id = payments.clinic_id)
  );
create policy payments_delete on public.payments for delete to authenticated
  using (app_private.has_role(clinic_id, array['owner']));

create policy notifications_select on public.notifications for select to authenticated
  using (app_private.is_member(clinic_id));

-- Column-level protection: staff may not forge tokens or audit columns.
revoke update on public.appointments from authenticated;
grant update (status, starts_at, ends_at, service_id, price, notes, cancel_reason, contact_name)
  on public.appointments to authenticated;
revoke update on public.clinics from authenticated;
grant update (name, doctor_name, specialty, phone, address, about, timezone, slot_interval_minutes,
              booking_window_days, min_notice_minutes, max_active_bookings_per_phone,
              is_published, reminders_enabled)
  on public.clinics to authenticated;
revoke update on public.staff from authenticated;
grant update (role, display_name) on public.staff to authenticated;
revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------

create or replace function app_private.available_slots(
  p_clinic_id uuid,
  p_service_id uuid,
  p_date date,
  p_exclude_appointment uuid default null
) returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c        public.clinics;
  v_dur    interval;
  v_today  date;
begin
  select * into c from public.clinics where id = p_clinic_id;
  if not found then
    return;
  end if;
  select make_interval(mins => s.duration_minutes) into v_dur
    from public.services s
   where s.id = p_service_id and s.clinic_id = p_clinic_id and s.is_active;
  if v_dur is null then
    return;
  end if;

  v_today := (now() at time zone c.timezone)::date;
  if p_date < v_today or p_date > v_today + c.booking_window_days then
    return;
  end if;

  return query
  with candidates as (
    select ((p_date + w.start_time) at time zone c.timezone)
           + make_interval(mins => c.slot_interval_minutes * g.n) as slot_start,
           ((p_date + w.end_time) at time zone c.timezone) as period_end
      from public.working_hours w
     cross join lateral generate_series(
       0,
       floor(extract(epoch from (w.end_time - w.start_time)) / 60 / c.slot_interval_minutes)::int
     ) as g(n)
     where w.clinic_id = c.id
       and w.weekday = extract(dow from p_date)::int
  )
  select cand.slot_start
    from candidates cand
   where cand.slot_start + v_dur <= cand.period_end
     and cand.slot_start >= now() + make_interval(mins => c.min_notice_minutes)
     and not exists (
       select 1 from public.appointments a
        where a.clinic_id = c.id
          and a.status not in ('cancelled', 'no_show')
          and a.source <> 'walk_in'
          and a.id is distinct from p_exclude_appointment
          and a.starts_at < cand.slot_start + v_dur
          and cand.slot_start < a.ends_at
     )
     and not exists (
       select 1 from public.time_off t
        where t.clinic_id = c.id
          and t.starts_at < cand.slot_start + v_dur
          and cand.slot_start < t.ends_at
     )
   order by cand.slot_start;
end;
$$;

-- ---------------------------------------------------------------------
-- Public (anonymous) RPCs
-- ---------------------------------------------------------------------

create or replace function public.public_get_clinic(p_slug text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'id', c.id,
    'slug', c.slug,
    'name', c.name,
    'doctor_name', c.doctor_name,
    'specialty', c.specialty,
    'phone', c.phone,
    'address', c.address,
    'about', c.about,
    'timezone', c.timezone,
    'booking_window_days', c.booking_window_days,
    'today', (now() at time zone c.timezone)::date,
    'working_days', coalesce((
      select json_agg(distinct w.weekday) from public.working_hours w where w.clinic_id = c.id
    ), '[]'::json),
    'services', coalesce((
      select json_agg(json_build_object(
               'id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes, 'price', s.price)
             order by s.sort_order, s.name)
        from public.services s
       where s.clinic_id = c.id and s.is_active and s.is_public
    ), '[]'::json)
  )
  from public.clinics c
  where c.slug = lower(p_slug) and c.is_published;
$$;

create or replace function public.public_get_slots(p_slug text, p_service_id uuid, p_date date)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.available_slots(c.id, s.id, p_date)
    from public.clinics c
    join public.services s on s.clinic_id = c.id and s.id = p_service_id and s.is_public
   where c.slug = lower(p_slug) and c.is_published;
$$;

create or replace function public.public_book(
  p_slug text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_full_name text,
  p_phone text,
  p_notes text default null
) returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c         public.clinics;
  s         public.services;
  v_phone   text;
  v_name    text;
  v_patient uuid;
  v_appt    public.appointments;
begin
  select * into c from public.clinics where slug = lower(p_slug) and is_published;
  if not found then
    raise exception 'CLINIC_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into s from public.services
   where id = p_service_id and clinic_id = c.id and is_active and is_public;
  if not found then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_name := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  v_phone := app_private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'NOTES_TOO_LONG' using errcode = '22023';
  end if;

  -- The requested start must be one of the currently offered slots.
  if not exists (
    select 1 from app_private.available_slots(c.id, s.id, (p_starts_at at time zone c.timezone)::date) as slot
     where slot = p_starts_at
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Serialise per clinic+phone so the active-bookings limit cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended(c.id::text || v_phone, 0));

  if (
    select count(*) from public.appointments a
      join public.patients p on p.id = a.patient_id
     where a.clinic_id = c.id and p.phone = v_phone
       and a.status in ('booked', 'confirmed') and a.starts_at > now()
  ) >= c.max_active_bookings_per_phone then
    raise exception 'TOO_MANY_BOOKINGS' using errcode = 'P0001';
  end if;

  -- Existing patient records are never overwritten from the public page.
  insert into public.patients (clinic_id, full_name, phone)
  values (c.id, v_name, v_phone)
  on conflict (clinic_id, phone) do nothing
  returning id into v_patient;
  if v_patient is null then
    select id into v_patient from public.patients where clinic_id = c.id and phone = v_phone;
  end if;

  begin
    insert into public.appointments (clinic_id, patient_id, service_id, contact_name, starts_at, ends_at,
                                     status, source, price, patient_notes)
    values (c.id, v_patient, s.id, v_name, p_starts_at, p_starts_at + make_interval(mins => s.duration_minutes),
            'booked', 'online', s.price, nullif(btrim(p_notes), ''))
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end;

  return json_build_object(
    'booking_ref', v_appt.booking_ref,
    'manage_token', v_appt.manage_token,
    'starts_at', v_appt.starts_at
  );
end;
$$;

create or replace function public.public_get_booking(p_token text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'booking_ref', a.booking_ref,
    'status', a.status,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'contact_name', a.contact_name,
    'service_id', a.service_id,
    'service_name', s.name,
    'price', a.price,
    'can_modify', a.status in ('booked', 'confirmed') and a.starts_at > now(),
    'clinic', json_build_object(
      'slug', c.slug, 'name', c.name, 'doctor_name', c.doctor_name, 'phone', c.phone,
      'address', c.address, 'timezone', c.timezone, 'today', (now() at time zone c.timezone)::date,
      'booking_window_days', c.booking_window_days
    )
  )
  from public.appointments a
  join public.clinics c on c.id = a.clinic_id
  left join public.services s on s.id = a.service_id
  where length(p_token) = 40 and a.manage_token = p_token;
$$;

create or replace function public.public_cancel_booking(p_token text, p_reason text default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.appointments
     set status = 'cancelled',
         cancel_reason = coalesce(nullif(btrim(left(p_reason, 300)), ''), 'ألغى المريض الحجز')
   where length(p_token) = 40 and manage_token = p_token
     and status in ('booked', 'confirmed') and starts_at > now()
  returning id into v_id;
  if v_id is null then
    raise exception 'CANNOT_MODIFY' using errcode = 'P0001';
  end if;
  return public.public_get_booking(p_token);
end;
$$;

create or replace function public.public_get_reschedule_slots(p_token text, p_date date)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.available_slots(a.clinic_id, a.service_id, p_date, a.id)
    from public.appointments a
   where length(p_token) = 40 and a.manage_token = p_token
     and a.status in ('booked', 'confirmed') and a.starts_at > now();
$$;

create or replace function public.public_reschedule_booking(p_token text, p_starts_at timestamptz)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a  public.appointments;
  tz text;
begin
  select * into a from public.appointments
   where length(p_token) = 40 and manage_token = p_token
     and status in ('booked', 'confirmed') and starts_at > now()
   for update;
  if not found then
    raise exception 'CANNOT_MODIFY' using errcode = 'P0001';
  end if;
  select timezone into tz from public.clinics where id = a.clinic_id;

  if a.service_id is null or not exists (
    select 1 from app_private.available_slots(a.clinic_id, a.service_id, (p_starts_at at time zone tz)::date, a.id) slot
     where slot = p_starts_at
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  begin
    update public.appointments set starts_at = p_starts_at, status = 'booked' where id = a.id;
  exception when exclusion_violation then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end;
  return public.public_get_booking(p_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Staff RPCs
-- ---------------------------------------------------------------------

create or replace function public.create_clinic(
  p_name text,
  p_slug text,
  p_doctor_name text default null,
  p_specialty text default null,
  p_phone text default null,
  p_timezone text default 'Africa/Cairo'
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  d     int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if (select count(*) from public.staff where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'TOO_MANY_CLINICS' using errcode = 'P0001';
  end if;

  begin
    insert into public.clinics (name, slug, doctor_name, specialty, phone, timezone)
    values (btrim(p_name), lower(btrim(p_slug)), nullif(btrim(p_doctor_name), ''),
            nullif(btrim(p_specialty), ''), nullif(btrim(p_phone), ''), coalesce(p_timezone, 'Africa/Cairo'))
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'SLUG_TAKEN' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'INVALID_CLINIC_DATA' using errcode = '22023';
  end;

  insert into public.staff (clinic_id, user_id, role, display_name)
  values (v_id, v_uid, 'owner',
          coalesce(nullif(btrim(p_doctor_name), ''), (select email from auth.users where id = v_uid)));

  -- Sensible defaults the owner can edit: Sat–Thu 5pm–10pm, one consultation service.
  foreach d in array array[6, 0, 1, 2, 3, 4] loop
    insert into public.working_hours (clinic_id, weekday, start_time, end_time)
    values (v_id, d, '17:00', '22:00');
  end loop;
  insert into public.services (clinic_id, name, duration_minutes, price, sort_order)
  values (v_id, 'كشف', 20, 0, 0),
         (v_id, 'إعادة', 15, 0, 1);

  return v_id;
end;
$$;

-- Links pending invites for the signed-in user's email to staff rows.
create or replace function public.accept_invites()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_count int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users
   where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  with pending as (
    update public.clinic_invites i
       set accepted_at = now()
     where i.email = v_email and i.accepted_at is null
    returning i.clinic_id, i.role
  )
  insert into public.staff (clinic_id, user_id, role, display_name)
  select clinic_id, v_uid, role, v_email from pending
  on conflict (clinic_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Phone / walk-in bookings created by reception.
create or replace function public.staff_create_appointment(
  p_clinic_id uuid,
  p_full_name text,
  p_phone text,
  p_service_id uuid,
  p_source text,
  p_starts_at timestamptz default null,
  p_notes text default null
) returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s         public.services;
  v_phone   text;
  v_name    text;
  v_patient uuid;
  v_start   timestamptz;
  v_appt    public.appointments;
begin
  if not app_private.is_member(p_clinic_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_source not in ('phone', 'walk_in') then
    raise exception 'INVALID_SOURCE' using errcode = '22023';
  end if;
  select * into s from public.services where id = p_service_id and clinic_id = p_clinic_id;
  if not found then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_name := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  v_phone := app_private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;

  if p_source = 'walk_in' then
    v_start := now();
  else
    if p_starts_at is null then
      raise exception 'START_REQUIRED' using errcode = '22023';
    end if;
    if p_starts_at < now() - interval '12 hours' then
      raise exception 'START_IN_PAST' using errcode = '22023';
    end if;
    v_start := p_starts_at;
  end if;

  insert into public.patients (clinic_id, full_name, phone)
  values (p_clinic_id, v_name, v_phone)
  on conflict (clinic_id, phone) do update set full_name = excluded.full_name
  returning id into v_patient;

  begin
    insert into public.appointments (clinic_id, patient_id, service_id, contact_name, starts_at, ends_at,
                                     status, source, price, notes, created_by)
    values (p_clinic_id, v_patient, s.id, v_name, v_start, v_start + make_interval(mins => s.duration_minutes),
            case when p_source = 'walk_in' then 'arrived' else 'booked' end,
            p_source, s.price, nullif(btrim(p_notes), ''), auth.uid())
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end;
  return v_appt;
end;
$$;

-- Day view for the reception dashboard (runs with the caller's RLS).
create or replace function public.staff_day_schedule(p_clinic_id uuid, p_date date)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  source text,
  booking_ref text,
  contact_name text,
  patient_id uuid,
  patient_name text,
  patient_phone text,
  service_id uuid,
  service_name text,
  price numeric,
  paid numeric,
  notes text,
  patient_notes text,
  arrived_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.starts_at, a.ends_at, a.status, a.source, a.booking_ref, a.contact_name,
         p.id, p.full_name, p.phone, s.id, s.name, a.price,
         coalesce((select sum(x.amount) from public.payments x where x.appointment_id = a.id), 0),
         a.notes, a.patient_notes, a.arrived_at
    from public.appointments a
    join public.clinics c on c.id = a.clinic_id
    join public.patients p on p.id = a.patient_id
    left join public.services s on s.id = a.service_id
   where a.clinic_id = p_clinic_id
     and a.starts_at >= (p_date::timestamp at time zone c.timezone)
     and a.starts_at <  ((p_date + 1)::timestamp at time zone c.timezone)
   order by a.starts_at;
$$;

-- Slots for reception when booking by phone (same rules as online, minus notice period).
create or replace function public.staff_available_slots(p_clinic_id uuid, p_service_id uuid, p_date date)
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_member(p_clinic_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query select app_private.available_slots(p_clinic_id, p_service_id, p_date);
end;
$$;

-- ---------------------------------------------------------------------
-- Notification worker RPCs (service_role only)
-- ---------------------------------------------------------------------

create or replace function public.claim_notifications(p_limit int default 20)
returns table (
  id uuid,
  kind text,
  to_phone text,
  attempts int,
  patient_name text,
  clinic_name text,
  clinic_phone text,
  clinic_address text,
  clinic_timezone text,
  starts_at timestamptz,
  manage_token text,
  booking_ref text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- recover rows stuck in 'sending' (worker crashed mid-flight)
  update public.notifications n
     set status = 'pending', locked_at = null
   where n.status = 'sending' and n.locked_at < now() - interval '10 minutes';

  -- reminders that are no longer useful
  update public.notifications n
     set status = 'skipped', last_error = 'expired'
    from public.appointments a
   where a.id = n.appointment_id and n.status = 'pending'
     and (a.starts_at <= now() or n.send_at < now() - interval '6 hours');

  return query
  with picked as (
    select n.id from public.notifications n
     where n.status = 'pending' and n.send_at <= now()
     order by n.send_at
     for update skip locked
     limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.notifications n
       set status = 'sending', locked_at = now(), attempts = n.attempts + 1
      from picked
     where n.id = picked.id
    returning n.*
  )
  select cl.id, cl.kind, cl.to_phone, cl.attempts, a.contact_name, c.name, c.phone, c.address, c.timezone,
         a.starts_at, a.manage_token, a.booking_ref
    from claimed cl
    join public.appointments a on a.id = cl.appointment_id
    join public.clinics c on c.id = cl.clinic_id;
end;
$$;

create or replace function public.complete_notification(
  p_id uuid, p_success boolean, p_error text default null, p_provider_message_id text default null
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_success then
    update public.notifications
       set status = 'sent', sent_at = now(), locked_at = null, last_error = null,
           provider_message_id = p_provider_message_id
     where id = p_id and status = 'sending';
  else
    update public.notifications
       set status = case when attempts >= 5 then 'failed' else 'pending' end,
           send_at = now() + make_interval(mins => power(2, attempts)::int),
           locked_at = null,
           last_error = left(p_error, 1000)
     where id = p_id and status = 'sending';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------

-- Start from nothing (Supabase default privileges grant EXECUTE to anon and
-- authenticated on every new function), then grant each RPC explicitly.
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.is_member(uuid) to authenticated;
grant execute on function app_private.has_role(uuid, text[]) to authenticated;

revoke all on function public.public_get_clinic(text) from public;
revoke all on function public.public_get_slots(text, uuid, date) from public;
revoke all on function public.public_book(text, uuid, timestamptz, text, text, text) from public;
revoke all on function public.public_get_booking(text) from public;
revoke all on function public.public_cancel_booking(text, text) from public;
revoke all on function public.public_get_reschedule_slots(text, date) from public;
revoke all on function public.public_reschedule_booking(text, timestamptz) from public;
revoke all on function public.create_clinic(text, text, text, text, text, text) from public;
revoke all on function public.accept_invites() from public;
revoke all on function public.staff_create_appointment(uuid, text, text, uuid, text, timestamptz, text) from public;
revoke all on function public.staff_day_schedule(uuid, date) from public;
revoke all on function public.staff_available_slots(uuid, uuid, date) from public;
revoke all on function public.claim_notifications(int) from public;
revoke all on function public.complete_notification(uuid, boolean, text, text) from public;

grant execute on function public.public_get_clinic(text) to anon, authenticated;
grant execute on function public.public_get_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.public_book(text, uuid, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.public_get_booking(text) to anon, authenticated;
grant execute on function public.public_cancel_booking(text, text) to anon, authenticated;
grant execute on function public.public_get_reschedule_slots(text, date) to anon, authenticated;
grant execute on function public.public_reschedule_booking(text, timestamptz) to anon, authenticated;
grant execute on function public.create_clinic(text, text, text, text, text, text) to authenticated;
grant execute on function public.accept_invites() to authenticated;
grant execute on function public.staff_create_appointment(uuid, text, text, uuid, text, timestamptz, text) to authenticated;
grant execute on function public.staff_day_schedule(uuid, date) to authenticated;
grant execute on function public.staff_available_slots(uuid, uuid, date) to authenticated;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.complete_notification(uuid, boolean, text, text) to service_role;

-- Live updates on the reception dashboard.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments;
  end if;
end;
$$;
