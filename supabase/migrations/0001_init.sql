-- V Square AI Sales Command Center — initial schema
-- Developed by Nexobova HQ
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- Users / roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'executive' check (role in ('admin','manager','executive')),
  executive_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.executives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text not null,
  email text not null,
  project_ids uuid[] not null default '{}',
  expertise text[] not null default '{}',
  locations text[] not null default '{}',
  available boolean not null default true,
  active boolean not null default true,
  daily_capacity int not null default 15 check (daily_capacity >= 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_executive_fk foreign key (executive_id) references public.executives(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Projects & knowledge base
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  property_type text not null check (property_type in ('plot','villa','apartment','investment')),
  configurations text,
  plot_dimensions text,
  price_range text,
  inventory text,
  amenities text[] not null default '{}',
  specifications text,
  approvals text,
  faqs jsonb not null default '[]',
  sales_contact text,
  instructions text,
  verified boolean not null default false,
  verified_by text,
  version int not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  filename text,
  content text not null,
  version int not null default 1,
  parent_id uuid,
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  approved_by text,
  chunk_count int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid,
  idx int not null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_chunks_doc_idx on public.document_chunks(document_id);

-- ---------------------------------------------------------------------------
-- Leads, conversations, messages
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  email text,
  source text not null check (source in ('website_chat','website_form','whatsapp','facebook_lead','instagram','webhook','manual')),
  source_detail text,
  status text not null default 'NEW' check (status in ('NEW','QUALIFIED','ASSIGNED','CONTACTED','FOLLOW_UP','SITE_VISIT_SCHEDULED','SITE_VISIT_COMPLETED','NEGOTIATION','CONVERTED','LOST')),
  property_type text check (property_type in ('plot','villa','apartment','investment')),
  preferred_location text,
  budget_min bigint,
  budget_max bigint,
  budget_text text,
  configuration text,
  purpose text check (purpose in ('investment','personal')),
  timeline text,
  site_visit_preference text,
  language text,
  score int not null default 0,
  score_reasons text[] not null default '{}',
  priority text not null default 'cold' check (priority in ('hot','warm','cold')),
  matched_project_ids uuid[] not null default '{}',
  assigned_executive_id uuid references public.executives(id) on delete set null,
  consent_whatsapp boolean not null default false,
  opted_out boolean not null default false,
  duplicate_of uuid references public.leads(id) on delete set null,
  deal_value bigint,
  lost_reason text,
  is_demo boolean not null default false,
  first_response_at timestamptz,
  last_interaction_at timestamptz,
  qualified_at timestamptz,
  assigned_at timestamptz,
  contacted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_exec_idx on public.leads(assigned_executive_id);
create index if not exists leads_created_idx on public.leads(created_at desc);
create index if not exists leads_phone_idx on public.leads(phone);
create index if not exists leads_source_idx on public.leads(source);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null,
  external_id text not null,
  status text not null default 'active' check (status in ('active','waiting','closed')),
  handler text not null default 'ai' check (handler in ('ai','human')),
  ai_paused boolean not null default false,
  escalated boolean not null default false,
  escalation_reason text,
  processing boolean not null default false,
  last_customer_message_at timestamptz,
  last_message_at timestamptz,
  last_asked_field text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one open conversation per channel identity => customers never share a session
create unique index if not exists conversations_channel_external_uq on public.conversations(channel, external_id) where status <> 'closed';
create index if not exists conversations_lead_idx on public.conversations(lead_id);
create index if not exists conversations_last_idx on public.conversations(last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  direction text not null check (direction in ('in','out','internal')),
  sender text not null check (sender in ('customer','ai','executive','system')),
  sender_name text,
  body text not null,
  provider_message_id text,
  delivery_status text not null default 'queued' check (delivery_status in ('received','queued','sent','delivered','read','failed','simulated')),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);
create unique index if not exists messages_provider_uq on public.messages(provider_message_id) where provider_message_id is not null;

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null,
  granted boolean not null,
  source text not null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Assignment, activity, visits, follow-ups
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  executive_id uuid references public.executives(id) on delete set null,
  previous_executive_id uuid,
  method text not null,
  reason text not null,
  assigned_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assignments_lead_idx on public.assignments(lead_id);
create index if not exists assignments_exec_created_idx on public.assignments(executive_id, created_at);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  type text not null,
  description text not null,
  actor text not null default 'system',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activities_lead_idx on public.activities(lead_id, created_at desc);
create index if not exists activities_created_idx on public.activities(created_at desc);

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  executive_id uuid references public.executives(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60,
  status text not null default 'requested' check (status in ('requested','confirmed','completed','cancelled','no_show')),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- an executive can never be double-booked for the same slot
create unique index if not exists site_visits_exec_slot_uq on public.site_visits(executive_id, scheduled_at) where status in ('requested','confirmed');
create index if not exists site_visits_sched_idx on public.site_visits(scheduled_at);

create table if not exists public.follow_up_rules (
  id text primary key,
  key text not null unique,
  name text not null,
  description text not null default '',
  delay_minutes int not null,
  escalate_after_minutes int,
  channel text not null check (channel in ('whatsapp_customer','whatsapp_executive','internal')),
  template text not null,
  respect_working_hours boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  executive_id uuid references public.executives(id) on delete set null,
  rule_key text not null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','done','skipped','escalated','cancelled')),
  result text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists follow_up_due_idx on public.follow_up_tasks(status, due_at);

-- ---------------------------------------------------------------------------
-- Notifications, integrations, settings, usage, logs
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('executive','customer','admin')),
  recipient text not null,
  channel text not null,
  template text,
  body text not null,
  status text not null default 'queued',
  provider_message_id text,
  error text,
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_provider_idx on public.notifications(provider_message_id);

create table if not exists public.integrations (
  id text primary key,
  config_encrypted text, -- AES-256-GCM, key held only in server env (ENCRYPTION_KEY)
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null,
  model text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms int not null default 0,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists usage_created_idx on public.usage_logs(created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_logs(created_at desc);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info','warn','error')),
  source text not null,
  message text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists system_logs_created_idx on public.system_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- Durable job queue + idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  key text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed','dead')),
  attempts int not null default 0,
  max_attempts int not null default 4,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_runnable_idx on public.jobs(status, run_at, created_at);
create index if not exists jobs_key_idx on public.jobs(key, status);

create table if not exists public.processed_events (
  id text primary key,
  source text not null,
  created_at timestamptz not null default now()
);

/*
 claim_jobs: atomically claims runnable jobs.
  - FOR UPDATE SKIP LOCKED => several workers never claim the same job.
  - At most one job per key, and no job whose key already has a live running job,
    so messages from the same customer are processed strictly in order while
    different customers run in parallel.
*/
create or replace function public.claim_jobs(p_limit int, p_stale_seconds int default 120)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  with busy as (
    select distinct key from jobs
    where status = 'running' and locked_at > now() - make_interval(secs => p_stale_seconds)
  ),
  candidates as (
    select distinct on (j.key) j.id
    from jobs j
    where (j.status = 'queued' or (j.status = 'running' and j.locked_at <= now() - make_interval(secs => p_stale_seconds)))
      and j.run_at <= now()
      and not exists (select 1 from busy b where b.key = j.key)
    order by j.key, j.created_at
  ),
  locked as (
    select j.id from jobs j
    where j.id in (select id from candidates)
    order by j.created_at
    limit p_limit
    for update skip locked
  )
  update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
  from locked where j.id = locked.id
  returning j.*;
end $$;
revoke all on function public.claim_jobs(int, int) from public, anon, authenticated;

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','executives','projects','documents','document_chunks','leads','conversations','messages','consents','notes','assignments','activities','site_visits','follow_up_rules','follow_up_tasks','notifications','integrations','settings','usage_logs','audit_logs','system_logs','jobs']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s; create trigger trg_touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;
