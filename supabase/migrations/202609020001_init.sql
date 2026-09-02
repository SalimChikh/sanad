-- Sanad — schéma initial.
-- Modèle : un "institution" (école OU garderie, même table — le champ `type`
-- distingue juste l'affichage, les deux ont exactement les mêmes besoins :
-- classes, enfants, fil d'actualité, calendrier) porte le personnel et les
-- enfants. Les parents ne s'inscrivent jamais eux-mêmes : ils sont invités
-- par l'établissement, avec leur compte directement lié au bon enfant —
-- même logique que les invitations d'équipe de Fidli, adaptée aux parents.

create extension if not exists pgcrypto;

-- Identité générique, indépendante du fournisseur d'authentification —
-- même pattern que Fidli (app_users) : un même humain (parent ou membre du
-- personnel) n'a qu'une seule ligne ici, quel que soit son rôle ailleurs.
create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_provider text not null,
  auth_subject text not null,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_provider, auth_subject)
);

create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type text not null check (type in ('school', 'daycare')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'rejected')),
  city text,
  country_code text not null default 'DZ',
  max_children integer not null default 30,
  logo_url text,
  primary_color text not null default '#2d6a4f',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rôle "owner" (créé l'établissement, gère tout) vs "educator" (personnel
-- invité, poste dans le fil et le calendrier mais ne gère ni l'abonnement
-- ni les autres comptes) — même distinction owner/staff que Fidli.
create table staff_users (
  user_id uuid not null references app_users(id),
  institution_id uuid not null references institutions(id) on delete cascade,
  role text not null check (role in ('owner', 'educator')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, institution_id)
);

-- Un owner invite un(e) éducateur/trice par courriel — même mécanique de
-- jeton à usage unique que parent_invites, réutilisée telle quelle.
create table staff_invites (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  email text not null,
  role text not null default 'educator' check (role in ('owner', 'educator')),
  token text not null unique,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create table classrooms (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  age_group text,
  created_at timestamptz not null default now()
);

create table children (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete set null,
  first_name text not null,
  last_name text not null,
  birth_date date,
  photo_url text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Plusieurs parents/tuteurs par enfant (mère, père, tuteur légal...) et,
-- via l'unicité sur parent_user_id seul dans le futur si besoin, un même
-- parent pourra couvrir plusieurs enfants (fratrie) sans duplication de
-- compte — c'est déjà supporté ici puisque parent_user_id n'est pas la clé.
create table parent_links (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  parent_user_id uuid not null references app_users(id),
  relationship text not null default 'guardian' check (relationship in ('mother', 'father', 'guardian')),
  created_at timestamptz not null default now(),
  unique (child_id, parent_user_id)
);

-- Un parent ne crée jamais son compte de son propre chef : le personnel
-- génère un lien à usage unique, envoyé par courriel, qui — une fois
-- ouvert et authentifié — crée le parent_link automatiquement.
create table parent_invites (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  email text not null,
  relationship text not null default 'guardian' check (relationship in ('mother', 'father', 'guardian')),
  token text not null unique,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

-- Le fil quotidien : photo, mot libre, repas, sieste, activité ou annonce
-- sont volontairement une seule table plutôt que cinq — un parent consulte
-- toujours "ce qui s'est passé aujourd'hui" comme un flux unique et
-- chronologique, jamais un type isolément. `child_id` nul = annonce pour
-- toute la classe/l'établissement (ex. "fermeture exceptionnelle demain").
create table posts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  child_id uuid references children(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete set null,
  author_user_id uuid not null references app_users(id),
  type text not null check (type in ('photo', 'note', 'meal', 'nap', 'activity', 'announcement')),
  caption text,
  media_url text,
  meal_status text check (meal_status in ('ate_all', 'ate_some', 'refused')),
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_user_id uuid not null references app_users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete set null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now()
);

create index on staff_invites (token);
create index on staff_users (institution_id);
create index on children (institution_id);
create index on children (classroom_id);
create index on parent_links (parent_user_id);
create index on parent_invites (token);
create index on posts (child_id, created_at desc);
create index on posts (institution_id, created_at desc) where child_id is null;
create index on comments (post_id, created_at);
create index on calendar_events (institution_id, start_at);
