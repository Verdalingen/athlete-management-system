-- Migration 002: Store AI-generated analysis and planning HTML reports

create table if not exists analyses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  created_at    timestamptz default now(),
  report_date   date not null,
  analysis_html text,
  planning_html text
);

alter table analyses enable row level security;

create policy "users manage their own analyses"
  on analyses for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index analyses_date_idx on analyses (user_id, report_date desc);

grant select, insert, update, delete on public.analyses to authenticated;
grant select, insert, update, delete on public.analyses to service_role;
