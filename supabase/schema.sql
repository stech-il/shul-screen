-- הרצה ב-Supabase SQL Editor
-- סנכרון ענן + רישיונות + אנליטיקה + heartbeat מסכים

create table if not exists synagogues (
  id text primary key,
  name text not null default '',
  config jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists synagogues_updated_at_idx on synagogues (updated_at desc);

alter table synagogues enable row level security;

create policy "Public read synagogues"
  on synagogues for select
  using (true);

create policy "Public upsert synagogues"
  on synagogues for insert
  with check (true);

create policy "Public update synagogues"
  on synagogues for update
  using (true);

-- Realtime
-- Database → Replication → הוסף את טבלת synagogues
alter publication supabase_realtime add table synagogues;

-- רישיונות (אימות מפתח + נעילה מרחוק)
create table if not exists licenses (
  key text primary key,
  plan text not null default 'trial',
  holder_name text,
  synagogue_id text,
  expires_at timestamptz,
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table licenses enable row level security;
create policy "Read licenses" on licenses for select using (true);
create policy "Update licenses" on licenses for update using (true);

-- אנליטיקה
create table if not exists analytics_events (
  id text primary key,
  synagogue_id text not null,
  event_type text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_synagogue_idx on analytics_events (synagogue_id, created_at desc);
alter table analytics_events enable row level security;
create policy "Insert analytics" on analytics_events for insert with check (true);
create policy "Read analytics" on analytics_events for select using (true);

-- סטטוס מסכים חיים
create table if not exists screen_heartbeats (
  synagogue_id text primary key,
  at timestamptz not null,
  version text,
  online boolean default true,
  layout text
);

alter table screen_heartbeats enable row level security;
create policy "Upsert heartbeats" on screen_heartbeats for insert with check (true);
create policy "Update heartbeats" on screen_heartbeats for update using (true);
create policy "Read heartbeats" on screen_heartbeats for select using (true);

-- מדיה: Storage bucket ציבורי בשם shul-media
-- ב-Dashboard: Storage → New bucket → shul-media → Public bucket = ON
-- ואז הרץ את הפוליסיות הבאות (אופציונלי אם ה-bucket כבר ציבורי):

insert into storage.buckets (id, name, public)
values ('shul-media', 'shul-media', true)
on conflict (id) do update set public = true;

create policy "Public read shul-media"
  on storage.objects for select
  using (bucket_id = 'shul-media');

create policy "Public upload shul-media"
  on storage.objects for insert
  with check (bucket_id = 'shul-media');

create policy "Public update shul-media"
  on storage.objects for update
  using (bucket_id = 'shul-media');

create policy "Public delete shul-media"
  on storage.objects for delete
  using (bucket_id = 'shul-media');
