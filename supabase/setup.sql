-- DatePlanner: Einrichtung der Datenbank
--
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.
-- Vorher ganz unten die beiden E-Mail-Adressen eintragen.
-- Das Skript kann gefahrlos mehrmals ausgeführt werden.

-- Wer gehört zu welchem Haushalt (ihr zwei teilt euch eine Liste)
create table if not exists public.members (
    email     text primary key,
    household uuid not null
);

-- Die Dates; der Inhalt eines Dates liegt komplett in "data"
create table if not exists public.dates (
    household  uuid not null,
    id         text not null,
    data       jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (household, id)
);

-- Haushalt der gerade angemeldeten Person
create or replace function public.my_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select household
    from public.members
    where email = lower(auth.jwt() ->> 'email')
$$;

-- Zugriffsregeln: nur angemeldete Mitglieder sehen und ändern ihre eigenen Dates
alter table public.members enable row level security;
alter table public.dates enable row level security;

drop policy if exists "Eigene Mitgliedschaft lesen" on public.members;
create policy "Eigene Mitgliedschaft lesen"
    on public.members for select
    to authenticated
    using (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "Dates des eigenen Haushalts" on public.dates;
create policy "Dates des eigenen Haushalts"
    on public.dates for all
    to authenticated
    using (household = public.my_household())
    with check (household = public.my_household());

revoke all on public.members, public.dates from anon;
grant select on public.members to authenticated;
grant select, insert, update, delete on public.dates to authenticated;

-- Haushalt anlegen: hier eure beiden E-Mail-Adressen eintragen
with h as (select gen_random_uuid() as id)
insert into public.members (email, household)
select lower(v.email), h.id
from h, (values
    ('deine@email.de'),
    ('partner@email.de')
) as v(email)
on conflict (email) do nothing;
