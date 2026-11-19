-- Production defaults (no demo data). Follow-up rules can be edited in the app.
insert into public.follow_up_rules (id, key, name, description, delay_minutes, escalate_after_minutes, channel, template, respect_working_hours, active) values
 ('rule_new_unassigned','new_unassigned','New lead not assigned','Alert admins if a lead remains unassigned.',15,60,'internal','Lead {{name}} ({{property_type}}) has been unassigned for {{delay}} minutes.',false,true),
 ('rule_assigned_not_contacted','assigned_not_contacted','Assigned lead not contacted','Remind the executive, then escalate to management.',60,240,'whatsapp_executive','Reminder: please contact {{name}} ({{phone}}) — {{property_type}} in {{location}}, budget {{budget}}.',true,true),
 ('rule_awaiting_callback','awaiting_callback','Interested customer awaiting callback','Customer asked for a call back.',30,180,'whatsapp_executive','{{name}} is waiting for your call back about {{property_type}} in {{location}}.',true,true),
 ('rule_visit_pending_confirmation','visit_pending_confirmation','Site visit pending confirmation','Visit requested but not confirmed by the team.',120,480,'whatsapp_executive','Please confirm the site visit requested by {{name}} on {{visit_time}}.',true,true),
 ('rule_visit_reminder','visit_reminder','Site visit reminder','Reminder to customer and executive before the visit.',0,null,'whatsapp_customer','Hi {{name}}, a reminder of your V Square Projects site visit on {{visit_time}}. Reply here to reschedule.',false,true),
 ('rule_visit_completed','visit_completed','Site visit completed','Thank the customer and ask for feedback the day after the visit.',1440,null,'whatsapp_customer','Hi {{name}}, thank you for visiting with V Square Projects. Do you have any questions we can help with?',true,true),
 ('rule_later_follow_up','later_follow_up','Customer requested later follow-up','Customer asked to be contacted later.',4320,null,'whatsapp_executive','Follow up with {{name}} — they asked to be contacted later about {{property_type}}.',true,true)
on conflict (id) do nothing;

insert into public.integrations (id) values ('openai'),('whatsapp'),('supabase'),('website_webhook'),('meta_leads'),('email')
on conflict (id) do nothing;

-- Retention helper: call from a scheduled job (pg_cron or the app's /api/jobs/run).
create or replace function public.apply_retention(p_message_days int, p_log_days int) returns void language sql security definer set search_path = public as $$
  delete from public.system_logs where created_at < now() - make_interval(days => p_log_days);
  delete from public.jobs where status in ('done','dead') and updated_at < now() - interval '14 days';
  delete from public.processed_events where created_at < now() - interval '30 days';
  delete from public.messages where created_at < now() - make_interval(days => p_message_days);
$$;
revoke all on function public.apply_retention(int, int) from public, anon, authenticated;
