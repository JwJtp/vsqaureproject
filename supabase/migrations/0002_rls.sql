-- Row Level Security.
-- The application server uses the service-role key (bypasses RLS) and enforces roles in code.
-- RLS is defence in depth: a browser holding only the anon key + a user session can read
-- nothing beyond what its role allows, and can never read secrets, jobs or logs.

create or replace function public.current_role_name() returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.current_executive_id() returns uuid language sql stable security definer set search_path = public as $$
  select executive_id from public.profiles where id = auth.uid()
$$;
create or replace function public.is_staff_admin() returns boolean language sql stable as $$
  select coalesce(public.current_role_name() in ('admin','manager'), false)
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','executives','projects','documents','document_chunks','leads','conversations','messages','consents','notes','assignments','activities','site_visits','follow_up_rules','follow_up_tasks','notifications','integrations','settings','usage_logs','audit_logs','system_logs','jobs','processed_events']
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Profiles: users read their own; admins read all
create policy profiles_self on public.profiles for select using (id = auth.uid() or public.is_staff_admin());

-- Admin/manager full read on business tables
do $$
declare t text;
begin
  foreach t in array array['executives','projects','documents','document_chunks','leads','conversations','messages','consents','notes','assignments','activities','site_visits','follow_up_rules','follow_up_tasks','notifications','usage_logs','audit_logs','system_logs']
  loop
    execute format('create policy %1$s_admin_read on public.%1$s for select using (public.is_staff_admin());', t);
  end loop;
end $$;

-- Executives: only their own leads and everything hanging off them
create policy leads_exec_read on public.leads for select
  using (assigned_executive_id = public.current_executive_id());
create policy conversations_exec_read on public.conversations for select
  using (exists (select 1 from public.leads l where l.id = lead_id and l.assigned_executive_id = public.current_executive_id()));
create policy messages_exec_read on public.messages for select
  using (exists (select 1 from public.leads l where l.id = lead_id and l.assigned_executive_id = public.current_executive_id()));
create policy notes_exec_read on public.notes for select
  using (exists (select 1 from public.leads l where l.id = lead_id and l.assigned_executive_id = public.current_executive_id()));
create policy visits_exec_read on public.site_visits for select using (executive_id = public.current_executive_id());
create policy tasks_exec_read on public.follow_up_tasks for select using (executive_id = public.current_executive_id());
create policy executives_self_read on public.executives for select using (id = public.current_executive_id());
create policy projects_staff_read on public.projects for select using (auth.uid() is not null);

-- integrations, settings, jobs, processed_events: no policies => no browser access at all.
