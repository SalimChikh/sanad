-- Un éducateur/trice est désormais assigné(e) à une ou plusieurs classes et
-- ne voit/peut publier que pour les enfants de ces classes-là — le owner
-- reste toujours non-restreint (accès à tout l'établissement), comme avant.

alter table staff_invites add column classroom_ids uuid[] not null default '{}';

create table staff_classrooms (
  user_id uuid not null,
  institution_id uuid not null,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, institution_id, classroom_id),
  foreign key (user_id, institution_id) references staff_users(user_id, institution_id) on delete cascade
);

create index on staff_classrooms (institution_id, classroom_id);
