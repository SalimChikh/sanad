# Sanad (سند)

Plateforme SaaS pour écoles et garderies : chaque établissement gère un fil
d'actualité quotidien par enfant (photos, notes, repas, sieste), un
calendrier, et invite les parents à suivre tout ça en temps réel et à
commenter. Trilingue français / arabe (RTL) / anglais dès le départ.

Marché visé : Algérie. Nom provisoire, facile à changer.

## Structure

- `frontend/` — React + Vite + TypeScript. Un seul fichier `App.tsx` pour
  l'instant (routage + toutes les pages), même approche que Fidli à ses
  débuts. `i18n.ts` gère les 3 langues et le sens d'écriture (RTL pour
  l'arabe, posé sur `<html dir="rtl">`).
- `backend/` — API FastAPI. `app/store.py` est un store **en mémoire**
  (aucune base de données requise pour développer/tester en local) dont
  chaque méthode correspond à une table de `supabase/migrations/` — passer
  à une vraie base Postgres/Supabase plus tard consiste à réimplémenter la
  même interface contre de vraies requêtes SQL, pas à redessiner les
  routes au-dessus.
- `supabase/migrations/` — schéma cible complet (institutions, personnel,
  classes, enfants, liens parents, invitations, fil d'actualité,
  commentaires, calendrier) pour le jour où une vraie base est branchée.

## Modèle

Un `institution` (école OU garderie — même table, seul le champ `type`
change l'affichage) porte le personnel (`staff_users`, rôle `owner` ou
`educator`) et les enfants (`children`, optionnellement groupés par
`classrooms`). Les parents ne créent **jamais** leur compte eux-mêmes : le
personnel génère un lien d'invitation à usage unique par enfant
(`parent_invites`), qui lie leur compte au bon enfant dès qu'ils
s'authentifient et l'ouvrent — même mécanique pour inviter un collègue du
personnel (`staff_invites`).

Le fil d'actualité (`posts`) est une seule table pour tous les types
(photo, note, repas, sieste, activité, annonce) plutôt que cinq tables
séparées : un parent consulte toujours « ce qui s'est passé aujourd'hui »
comme un flux chronologique unique, jamais un type isolément.

## Démarrer en local

### Backend
```
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload --port 8080
```
Sans `DATABASE_URL` ni Firebase configurés, l'API tourne en mode démo :
`Authorization: Bearer demo-owner-token` simule le premier membre du
personnel, `Bearer demo-parent-token` simule un parent. Rien ne persiste
entre deux redémarrages du serveur.

### Frontend
```
cd frontend
npm install
npm run dev
```
Par défaut, appelle `http://localhost:8080/api/v1` (`VITE_API_URL` pour
changer). En mode démo, `localStorage.setItem("sanad-demo-role", "parent")`
puis recharger la page permet de basculer entre l'expérience personnel et
l'expérience parent sans créer un vrai deuxième compte — voir le
commentaire dans `frontend/src/api.ts`.

## Ce qui est fait

- Créer un établissement (école ou garderie), inviter du personnel
- Classes, enfants, invitation de parents par lien à usage unique
- Fil d'actualité par enfant : photo (vrai téléversement depuis le
  téléphone/l'ordinateur, voir `backend/app/media.py`), note libre, repas —
  avec commentaires
- Calendrier simple (liste d'événements)
- FR / AR (RTL) / EN, détection automatique de la langue du navigateur au
  premier chargement, choix explicite mémorisé ensuite

## Ce qui manque avant un vrai lancement

- **Base de données réelle** — tout est en mémoire pour l'instant (voir
  `backend/app/store.py`) ; le schéma cible existe déjà dans
  `supabase/migrations/`, il ne reste qu'à provisionner un projet Supabase
  et réécrire le store contre de vraies requêtes SQL (même travail que
  Fidli a fait pour son propre passage en production).
- **Stockage de photos réel** — les photos téléversées atterrissent sur le
  disque local du serveur (`backend/uploads/`, ignoré par git), servies
  directement par FastAPI. Ça fonctionne, mais sur un hébergeur gratuit
  comme Render le disque n'est pas garanti persistant : une photo peut
  disparaître après un redéploiement ou un redémarrage à froid — même mise
  en garde que le SQLite de Valet Signature. À remplacer par un vrai bucket
  (Supabase Storage ou équivalent) une fois la base en place.
- **Courriels réels** — les invitations (personnel et parents) génèrent un
  lien à copier-coller manuellement, aucun courriel n'est envoyé.
- **Hébergement** — rien n'est déployé. Le frontend (statique) et le
  backend (conteneur) suivent le même chemin gratuit que Fidli/Valet
  Signature (Firebase Hosting + un backend gratuit type Render, en
  attendant un nom de domaine et une vraie base).
- **Calendrier** — vue liste seulement, pas de calendrier visuel par mois.
- **Polish visuel et RTL** — l'essentiel fonctionne (testé visuellement en
  arabe), mais n'a pas reçu la même passe de finition que la page d'accueil
  de Fidli.
- **Tests automatisés** — aucun encore, contrairement à Fidli (29 tests
  backend + 13 tests frontend à ce jour sur ce projet-là).
