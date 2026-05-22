create table if not exists public.news (
  id text primary key,
  date date not null,
  title text not null,
  menu_name text not null default '',
  price text not null default '',
  sales_time text not null default '',
  body_ja text not null,
  body_en text not null default '',
  image_alt text not null default '',
  image_url text not null default '',
  source text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_published_date_id_idx
  on public.news (published, date desc, id desc);

create or replace function public.set_news_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_news_updated_at on public.news;

create trigger set_news_updated_at
before update on public.news
for each row
execute function public.set_news_updated_at();

alter table public.news enable row level security;

drop policy if exists "Public can read published news" on public.news;

create policy "Public can read published news"
on public.news
for select
using (published = true);
