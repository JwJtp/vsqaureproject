-- Create your first admin AFTER creating the user in Supabase → Authentication → Users.
-- Replace the email below, then run in the SQL editor.
insert into public.profiles (id, email, name, role)
select id, email, 'V Square Admin', 'admin' from auth.users where email = 'admin@vsquareprojects.in'
on conflict (id) do update set role = 'admin';

-- Link an executive login to an executive record (so they see only their leads):
-- insert into public.profiles (id, email, name, role, executive_id)
-- select u.id, u.email, e.name, 'executive', e.id from auth.users u join public.executives e on e.email = u.email
-- where u.email = 'executive@example.com'
-- on conflict (id) do update set role = 'executive', executive_id = excluded.executive_id;
