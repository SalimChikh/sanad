-- Le fil d'actualité passe d'un choix "photo OU note OU repas" à une seule
-- entrée "résumé du jour" combinant texte, plusieurs photos, humeur et
-- repas — voir type='daily' et le composeur unique côté frontend.

alter table posts add column media_urls text[] not null default '{}';
alter table posts add column mood text check (mood in ('happy', 'calm', 'tired', 'difficult'));
alter table posts drop constraint posts_type_check;
alter table posts add constraint posts_type_check
  check (type in ('daily', 'photo', 'note', 'meal', 'nap', 'activity', 'announcement'));
