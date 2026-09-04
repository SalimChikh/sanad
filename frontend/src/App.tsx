import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Baby,
  Calendar,
  Camera,
  Home,
  LogOut,
  MessageCircle,
  School,
  UserPlus,
  Users,
} from "lucide-react";
import { mediaUrl, request, uploadPhoto, type CalendarEvent, type Child, type Classroom, type Comment, type Member, type Post, type StaffInvite, type StaffMember } from "./api";
import { authConfigured, authProvider } from "./auth";
import { useLang, type Lang } from "./i18n";

// ---------------------------------------------------------------- language

function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  const options: { value: Lang; label: string }[] = [
    { value: "fr", label: "FR" },
    { value: "ar", label: "AR" },
    { value: "en", label: "EN" },
  ];
  return (
    <div className="lang-switch">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === lang ? "active" : ""}
          onClick={() => setLang(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- landing

function Landing() {
  const { t } = useLang();
  return (
    <div className="landing">
      <nav className="top">
        <Link className="brand" to="/">
          <School /> Sanad
        </Link>
        <div>
          <Link className="text-link" to="/login">{t("Se connecter")}</Link>
          <Link className="button small" to="/register">{t("S’inscrire")}</Link>
          <LanguageSwitcher />
        </div>
      </nav>
      <header className="hero">
        <h1>{t("Bienvenue sur Sanad")}</h1>
        <p>{t("La plateforme qui relie votre établissement et les parents, au quotidien.")}</p>
        <p className="lead">{t("Photos, calendrier, repas, commentaires : tout au même endroit, pour chaque enfant.")}</p>
        <Link className="button" to="/register">{t("Commencer")}</Link>
      </header>
    </div>
  );
}

// ---------------------------------------------------------------- auth

function Auth({ register = false }: { register?: boolean }) {
  const { t } = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  // A parent following their invite link with no account yet gets bounced
  // here as /login?next=/parent-invite/<token> (see AcceptInvite) — without
  // carrying that through, they'd land on /app after signing up and get
  // asked to "create an institution" instead of being linked to their
  // child. Landing-page sign-up (no ?next) still lands on /app as before,
  // which is where a brand-new owner belongs.
  const next = params.get("next") || "/app";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Demo mode (no Firebase project wired up yet): there is no real sign-up
  // to do, and every request already carries a fixed demo bearer token
  // (see api.ts) regardless of what happens on this screen. Sending
  // someone here at all — e.g. via the landing page's "S'inscrire" link —
  // would be a dead end once they submit, so skip straight past it instead.
  useEffect(() => {
    if (!authConfigured) nav(next, { replace: true });
  }, [nav, next]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      if (!authConfigured) throw new Error("Le fournisseur d’authentification doit être configuré.");
      const credentials = { email: String(data.email), password: String(data.password) };
      if (register && credentials.password !== String(data.confirm_password)) {
        throw new Error("Les deux mots de passe ne correspondent pas.");
      }
      const result = register ? await authProvider.signUp(credentials) : await authProvider.signInWithPassword(credentials);
      if (result.error) throw result.error;
      nav(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    setBusy(true);
    try {
      const result = await authProvider.signInWithGoogle();
      if (result.error) throw result.error;
      nav(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const nextParam = next === "/app" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <div className="auth">
      <Link className="brand" to="/"><School /> Sanad</Link>
      <form className="panel auth-card" onSubmit={submit}>
        <h2>{register ? t("Créer votre compte") : t("Heureux de vous revoir")}</h2>
        <button type="button" className="button secondary" disabled={busy} onClick={google}>
          {t("Continuer avec Google")}
        </button>
        <div className="auth-divider"><span>{t("ou")}</span></div>
        <label>
          {t("Adresse courriel")}
          <input name="email" type="email" required />
        </label>
        <label>
          {t("Mot de passe")}
          <input name="password" type="password" minLength={8} required />
        </label>
        {register && (
          <label>
            {t("Confirmer le mot de passe")}
            <input name="confirm_password" type="password" minLength={8} required />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={busy}>
          {register ? t("S’inscrire") : t("Se connecter")}
        </button>
        <small>
          {register ? (
            <>{t("Déjà inscrit ?")} <Link to={`/login${nextParam}`}>{t("Se connecter")}</Link></>
          ) : (
            <>{t("Pas encore de compte ?")} <Link to={`/register${nextParam}`}>{t("S’inscrire")}</Link></>
          )}
        </small>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- onboarding (create institution)

function CreateInstitution({ onCreated }: { onCreated: (member: Member) => void }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const member = await request<Member>("/auth/bootstrap", {
        method: "POST",
        body: JSON.stringify({ institution_name: data.institution_name, institution_type: data.institution_type }),
      });
      onCreated(member);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <Link className="brand" to="/"><School /> Sanad</Link>
      <form className="panel auth-card" onSubmit={submit}>
        <h2>{t("Créer votre compte")}</h2>
        <label>
          {t("Nom de l’établissement")}
          <input name="institution_name" required placeholder="École Al Amal" />
        </label>
        <label>
          {t("Type d’établissement")}
          <select name="institution_type" defaultValue="daycare">
            <option value="daycare">{t("Garderie")}</option>
            <option value="school">{t("École")}</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={busy}>{t("Créer mon établissement")}</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- shell

const staffLinks = [
  ["overview", "Aperçu", Home],
  ["children", "Enfants", Baby],
  ["classrooms", "Classes", Users],
  ["calendar", "Calendrier", Calendar],
  ["team", "Équipe", UserPlus],
] as const;

function StaffShell({ member }: { member: Member & { kind: "staff" } }) {
  const { t } = useLang();
  const nav = useNavigate();
  async function logout() {
    if (authConfigured) await authProvider.signOut();
    nav("/");
  }
  return (
    <div className="shell">
      <aside>
        <Link className="brand" to="/app">
          <School /> Sanad
        </Link>
        <p className="institution-name">{member.institution_name}</p>
        <nav>
          {staffLinks.map(([path, label, Icon]) => (
            <NavLink key={path} to={`/app/${path}`}>
              <Icon size={18} /> {t(label)}
            </NavLink>
          ))}
        </nav>
        <LanguageSwitcher />
        <button className="logout" onClick={logout}>
          <LogOut size={16} /> {t("Déconnexion")}
        </button>
      </aside>
      <section className="content">
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview member={member} />} />
          <Route path="children" element={<ChildrenList institutionId={member.institution_id} />} />
          <Route path="children/:childId" element={<ChildDetail canPost />} />
          <Route path="classrooms" element={<ClassroomsPage institutionId={member.institution_id} />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="team" element={<TeamPage />} />
        </Routes>
      </section>
    </div>
  );
}

function ParentShell({ member }: { member: Member & { kind: "parent" } }) {
  const { t } = useLang();
  const nav = useNavigate();
  async function logout() {
    if (authConfigured) await authProvider.signOut();
    nav("/");
  }
  return (
    <div className="shell">
      <aside>
        <Link className="brand" to="/app">
          <School /> Sanad
        </Link>
        <p className="institution-name">{t("Mes enfants")}</p>
        <nav>
          <NavLink to="/app/children"><Baby size={18} /> {t("Mes enfants")}</NavLink>
          <NavLink to="/app/calendar"><Calendar size={18} /> {t("Calendrier")}</NavLink>
        </nav>
        <LanguageSwitcher />
        <button className="logout" onClick={logout}>
          <LogOut size={16} /> {t("Déconnexion")}
        </button>
      </aside>
      <section className="content">
        <Routes>
          <Route index element={<Navigate to="children" replace />} />
          <Route path="children" element={<ParentChildren children={member.children} />} />
          <Route path="children/:childId" element={<ChildDetail canPost={false} />} />
          <Route path="calendar" element={<CalendarPage parentChildren={member.children} />} />
        </Routes>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- staff: overview

function Overview({ member }: { member: Member & { kind: "staff" } }) {
  const { t } = useLang();
  const [children, setChildren] = useState<Child[]>([]);
  useEffect(() => { request<Child[]>("/children").then(setChildren); }, []);
  return (
    <div className="page">
      <h1>{t("Aperçu")}</h1>
      <div className="stats">
        <div className="panel stat"><Baby /><strong>{children.length}</strong><span>{t("Enfants")}</span></div>
      </div>
      <p>{member.institution_name}</p>
    </div>
  );
}

// ---------------------------------------------------------------- staff: children

function ChildrenList({ institutionId }: { institutionId: string }) {
  const { t } = useLang();
  const [children, setChildren] = useState<Child[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => request<Child[]>("/children?include_inactive=true").then(setChildren).finally(() => setLoading(false));
  useEffect(() => {
    void load();
    request<Classroom[]>("/classrooms").then(setClassrooms);
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    try {
      await request("/children", {
        method: "POST",
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          birth_date: data.birth_date,
          classroom_id: data.classroom_id || null,
        }),
      });
      formElement.reset();
      setShowForm(false);
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(child: Child) {
    const next = !child.active;
    if (!next && !window.confirm(t("Retirer cet enfant ? Son historique est conservé."))) return;
    await request(`/children/${child.id}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
    void load();
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("Enfants")}</h1>
        <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>{t("Ajouter un enfant")}</button>
      </div>
      {showForm && (
        <form className="panel inline-form" onSubmit={submit}>
          <label>{t("Prénom")}<input name="first_name" required /></label>
          <label>{t("Nom")}<input name="last_name" required /></label>
          <label>{t("Date de naissance")}<input name="birth_date" type="date" required max={new Date().toISOString().slice(0, 10)} /></label>
          <label>
            {t("Classe")}
            <select name="classroom_id" defaultValue="">
              <option value="">{t("Aucune classe")}</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => setShowForm(false)}>{t("Annuler")}</button>
            <button className="button" disabled={busy}>{t("Ajouter")}</button>
          </div>
        </form>
      )}
      <div className="cards-grid">
        {children.map((child) => (
          <div className={`panel child-card${child.active ? "" : " inactive"}`} key={child.id}>
            <Link className="child-card-link" to={`/app/children/${child.id}`}>
              <span className="avatar">{child.first_name[0]}</span>
              <strong>{child.first_name} {child.last_name}</strong>
              <span className={`badge status-badge ${child.active ? "active" : "inactive"}`}>
                {child.active ? t("Actif") : t("Inactif")}
              </span>
            </Link>
            <button type="button" className="text-link small" onClick={() => toggleActive(child)}>
              {child.active ? t("Retirer") : t("Réactiver")}
            </button>
          </div>
        ))}
        {loading && <p className="empty">{t("Chargement…")}</p>}
        {!loading && !children.length && <p className="empty">{t("Aucun enfant pour l’instant.")}</p>}
      </div>
      {institutionId && null}
    </div>
  );
}

function ParentChildren({ children }: { children: Child[] }) {
  const { t } = useLang();
  return (
    <div className="page">
      <h1>{t("Mes enfants")}</h1>
      <div className="cards-grid">
        {children.map((child) => (
          <Link className="panel child-card" key={child.id} to={`/app/children/${child.id}`}>
            <span className="avatar">{child.first_name[0]}</span>
            <strong>{child.first_name} {child.last_name}</strong>
            <span className="text-link">{t("Voir le fil")}</span>
          </Link>
        ))}
        {!children.length && <p className="empty">{t("Vous n’avez pas encore d’enfant lié à votre compte.")}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- child detail (feed)

const postTypeLabels: Record<Post["type"], string> = {
  daily: "Résumé du jour", photo: "Photo", note: "Note", meal: "Repas", nap: "Sieste", activity: "Activité", announcement: "Annonce",
};

const moods: Array<{ value: "happy" | "calm" | "tired" | "difficult"; emoji: string; label: string }> = [
  { value: "happy", emoji: "😊", label: "Joyeux" },
  { value: "calm", emoji: "😌", label: "Calme" },
  { value: "tired", emoji: "😴", label: "Fatigué" },
  { value: "difficult", emoji: "😣", label: "Journée difficile" },
];

function ChildDetail({ canPost }: { canPost: boolean }) {
  const { t, lang } = useLang();
  const { childId } = useParams();
  const [child, setChild] = useState<Child | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loadChild = () => request<Child>(`/children/${childId}`).then(setChild).catch((e) => setError((e as Error).message));
  const loadFeed = () => request<Post[]>(`/feed?child_id=${childId}`).then(setPosts).catch((e) => setError((e as Error).message)).finally(() => setFeedLoading(false));
  useEffect(() => {
    if (!childId) return;
    void loadChild();
    void loadFeed();
    if (canPost) request<Classroom[]>("/classrooms").then(setClassrooms);
  }, [childId]);

  if (!child) return <div className="page"><p>{t("Chargement…")}</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link className="text-link" to="../..">{t("Retour")}</Link>
          <h1>{child.first_name} {child.last_name}</h1>
        </div>
        {canPost && (
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => setEditOpen((v) => !v)}>
              {t("Modifier")}
            </button>
            <button type="button" className="button secondary" onClick={() => setInviteOpen((v) => !v)}>
              {t("Inviter un parent")}
            </button>
          </div>
        )}
      </div>
      {editOpen && (
        <EditChildForm
          child={child}
          classrooms={classrooms}
          onSaved={(updated) => { setChild(updated); setEditOpen(false); }}
          onClose={() => setEditOpen(false)}
        />
      )}
      {inviteOpen && childId && <ParentInvitePanel childId={childId} onClose={() => setInviteOpen(false)} />}
      {canPost && childId && <PostComposer childId={childId} onPosted={loadFeed} />}
      {error && <p className="error">{error}</p>}
      <div className="feed">
        {posts.map((post) => <PostCard key={post.id} post={post} lang={lang} />)}
        {feedLoading && <p className="empty">{t("Chargement…")}</p>}
        {!feedLoading && !posts.length && <p className="empty">{t("Aucune publication pour le moment.")}</p>}
      </div>
    </div>
  );
}

function EditChildForm({ child, classrooms, onSaved, onClose }: {
  child: Child; classrooms: Classroom[]; onSaved: (child: Child) => void; onClose: () => void;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const updated = await request<Child>(`/children/${child.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          birth_date: data.birth_date,
          classroom_id: data.classroom_id || null,
          notes: data.notes || null,
        }),
      });
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel inline-form" onSubmit={submit}>
      <label>{t("Prénom")}<input name="first_name" defaultValue={child.first_name} required /></label>
      <label>{t("Nom")}<input name="last_name" defaultValue={child.last_name} required /></label>
      <label>{t("Date de naissance")}<input name="birth_date" type="date" defaultValue={child.birth_date ?? ""} required max={new Date().toISOString().slice(0, 10)} /></label>
      <label>
        {t("Classe")}
        <select name="classroom_id" defaultValue={child.classroom_id ?? ""}>
          <option value="">{t("Aucune classe")}</option>
          {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>{t("Notes")}<textarea name="notes" defaultValue={child.notes ?? ""} /></label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onClose}>{t("Annuler")}</button>
        <button className="button" disabled={busy}>{t("Enregistrer")}</button>
      </div>
    </form>
  );
}

function ParentInvitePanel({ childId, onClose }: { childId: string; onClose: () => void }) {
  const { t } = useLang();
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const invite = await request<{ token: string }>(`/children/${childId}/parent-invites`, {
        method: "POST",
        body: JSON.stringify({ email: data.email, relationship: data.relationship }),
      });
      setLink(`${window.location.origin}/parent-invite/${invite.token}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel inline-form">
      {link ? (
        <>
          <p>{t("Lien d’invitation créé — envoyez-le au parent :")}</p>
          <div className="copy-row">
            <code>{link}</code>
            <button type="button" className="button secondary" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }}>
              {copied ? t("Lien copié ✓") : t("Copier le lien")}
            </button>
          </div>
          <button type="button" className="button secondary" onClick={onClose}>{t("Retour")}</button>
        </>
      ) : (
        <form onSubmit={submit}>
          <label>{t("Adresse courriel")}<input name="email" type="email" required /></label>
          <label>
            {t("Relation")}
            <select name="relationship" defaultValue="guardian">
              <option value="mother">{t("Mère")}</option>
              <option value="father">{t("Père")}</option>
              <option value="guardian">{t("Tuteur/tutrice")}</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={onClose}>{t("Annuler")}</button>
            <button className="button" disabled={busy}>{t("Inviter un parent")}</button>
          </div>
        </form>
      )}
    </div>
  );
}

type PickedPhoto = { path: string; preview: string };

export function PostComposer({ childId, onPosted }: { childId: string; onPosted: () => void }) {
  const { t } = useLang();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [mood, setMood] = useState<"" | "happy" | "calm" | "tired" | "difficult">("");
  const [mealStatus, setMealStatus] = useState<"" | "ate_all" | "ate_some" | "refused">("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function pickPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError("");
    setUploading(true);
    for (const file of files) {
      // Show each pick immediately via a local object URL, then swap in
      // the real path once the upload resolves — several photos can be
      // in flight/failing independently rather than one blocking the rest.
      const preview = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { path: "", preview }]);
      try {
        const { path } = await uploadPhoto(file);
        setPhotos((prev) => prev.map((p) => (p.preview === preview ? { ...p, path } : p)));
      } catch (err) {
        setError((err as Error).message);
        setPhotos((prev) => prev.filter((p) => p.preview !== preview));
      }
    }
    setUploading(false);
    e.target.value = "";
  }

  function removePhoto(preview: string) {
    setPhotos((prev) => prev.filter((p) => p.preview !== preview));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    const caption = String(data.caption || "").trim();
    if (!caption && !photos.length) {
      setError(t("Ajoutez un résumé ou au moins une photo."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/posts", {
        method: "POST",
        body: JSON.stringify({
          child_id: childId, type: "daily", caption: caption || null,
          media_urls: photos.map((p) => p.path).filter(Boolean),
          mood: mood || null, meal_status: mealStatus || null,
        }),
      });
      formElement.reset();
      setPhotos([]);
      setMood("");
      setMealStatus("");
      onPosted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel composer" onSubmit={submit}>
      <textarea name="caption" placeholder={t("Résumé de la journée…")} />
      <label className="photo-picker multi">
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pickPhotos} hidden />
        <span><Camera size={20} /> {t("Ajouter des photos")}</span>
      </label>
      {photos.length > 0 && (
        <div className="photo-strip">
          {photos.map((p) => (
            <div className="photo-thumb" key={p.preview}>
              <img src={p.preview} alt="" />
              {!p.path && <span className="uploading-badge small">{t("Envoi…")}</span>}
              <button type="button" onClick={() => removePhoto(p.preview)} aria-label={t("Retirer")}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-field">
        <span className="composer-field-label">{t("Humeur")}</span>
        <div className="segmented">
          {moods.map((m) => (
            <button
              type="button" key={m.value}
              className={mood === m.value ? "active" : ""}
              onClick={() => setMood((prev) => (prev === m.value ? "" : m.value))}
            >
              {m.emoji} {t(m.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="composer-field">
        <span className="composer-field-label">{t("Repas")}</span>
        <div className="segmented">
          <button type="button" className={mealStatus === "ate_all" ? "active" : ""} onClick={() => setMealStatus((prev) => (prev === "ate_all" ? "" : "ate_all"))}>{t("A tout mangé")}</button>
          <button type="button" className={mealStatus === "ate_some" ? "active" : ""} onClick={() => setMealStatus((prev) => (prev === "ate_some" ? "" : "ate_some"))}>{t("A mangé un peu")}</button>
          <button type="button" className={mealStatus === "refused" ? "active" : ""} onClick={() => setMealStatus((prev) => (prev === "refused" ? "" : "refused"))}>{t("A refusé")}</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy || uploading}>{t("Publier le résumé du jour")}</button>
    </form>
  );
}

function PostCard({ post, lang }: { post: Post; lang: Lang }) {
  const { t } = useLang();
  const [comments, setComments] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-CA" : "fr-CA";

  async function toggle() {
    setOpen((v) => !v);
    if (!comments.length) {
      const result = await request<Comment[]>(`/posts/${post.id}/comments`);
      setComments(result);
    }
  }

  async function submitComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    try {
      const comment = await request<Comment>(`/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: data.body }),
      });
      setComments((prev) => [...prev, comment]);
      formElement.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel post-card">
      <div className="post-head">
        <span className={`badge type-${post.type}`}>{t(postTypeLabels[post.type])}</span>
        <small>{new Date(post.created_at).toLocaleString(locale)}</small>
      </div>
      {post.mood && (
        <p className="mood-line">
          {moods.find((m) => m.value === post.mood)?.emoji} {t(moods.find((m) => m.value === post.mood)?.label ?? "")}
        </p>
      )}
      {post.caption && <p>{post.caption}</p>}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className="post-photo-grid">
          {post.media_urls.map((url) => <img key={url} className="post-photo" src={mediaUrl(url)} alt="" />)}
        </div>
      )}
      {post.media_url && <img className="post-photo" src={mediaUrl(post.media_url)} alt="" />}
      {post.meal_status && (
        <p className="meal-status">
          {post.meal_status === "ate_all" ? t("A tout mangé") : post.meal_status === "ate_some" ? t("A mangé un peu") : t("A refusé")}
        </p>
      )}
      <small className="post-author">{post.author_name}</small>
      <button type="button" className="text-link comments-toggle" onClick={toggle}>
        <MessageCircle size={14} /> {comments.length || ""}
      </button>
      {open && (
        <div className="comments">
          {comments.map((comment) => (
            <div className="comment" key={comment.id}>
              <strong>{comment.author_name}</strong>
              <span>{comment.body}</span>
            </div>
          ))}
          {!comments.length && <p className="empty small">{t("Aucun commentaire.")}</p>}
          <form className="comment-form" onSubmit={submitComment}>
            <input name="body" placeholder={t("Écrire un commentaire…")} required />
            <button className="button small" disabled={busy}>{t("Envoyer")}</button>
          </form>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- staff: classrooms

function ClassroomsPage({ institutionId }: { institutionId: string }) {
  const { t } = useLang();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = () => request<Classroom[]>("/classrooms").then(setClassrooms).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    try {
      await request("/classrooms", { method: "POST", body: JSON.stringify({ name: data.name, age_group: data.age_group || null }) });
      formElement.reset();
      void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>{t("Classes")}</h1>
      <form className="panel inline-form" onSubmit={submit}>
        <label>{t("Nom de la classe")}<input name="name" required /></label>
        <label>{t("Groupe d’âge")}<input name="age_group" placeholder={t("Ex. 2-3 ans")} /></label>
        <button className="button" disabled={busy}>{t("Ajouter")}</button>
      </form>
      <div className="cards-grid">
        {classrooms.map((c) => (
          <div className="panel" key={c.id}>
            <strong>{c.name}</strong>
            {c.age_group && <p>{c.age_group}</p>}
          </div>
        ))}
        {loading && <p className="empty">{t("Chargement…")}</p>}
        {!loading && !classrooms.length && <p className="empty">{t("Aucune classe pour l’instant.")}</p>}
      </div>
      {institutionId && null}
    </div>
  );
}

// ---------------------------------------------------------------- calendar

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Monday-first 6x7 grid covering the whole month, padded with the trailing
 * days of the previous/next month so every row is full — a fixed week
 * start keeps the grid simple across all three languages rather than
 * following each locale's actual first-day-of-week convention. */
export function buildMonthGrid(monthCursor: Date): Date[] {
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function CalendarPage({ parentChildren }: { parentChildren?: Child[] } = {}) {
  const { t, lang } = useLang();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [postsByChild, setPostsByChild] = useState<Record<string, Post[]>>({});
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-CA" : "fr-CA";
  const load = () => request<CalendarEvent[]>("/calendar-events").then(setEvents).finally(() => setEventsLoading(false));
  useEffect(() => { void load(); }, []);

  // A parent's calendar also surfaces that day's communications (photos,
  // notes, meals…) for each of their children — not just institution
  // events — since "what happened today" is really what a parent wants
  // when they click a day, not a bare events list.
  useEffect(() => {
    if (!parentChildren?.length) return;
    for (const child of parentChildren) {
      request<Post[]>(`/feed?child_id=${child.id}`).then((posts) => {
        setPostsByChild((prev) => ({ ...prev, [child.id]: posts }));
      });
    }
  }, [parentChildren]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(new Date(event.start_at));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  const today = new Date();
  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const selectedEvents = (eventsByDay.get(dayKey(selected)) ?? []).slice().sort((a, b) => a.start_at.localeCompare(b.start_at));
  const selectedPostsByChild = (parentChildren ?? []).map((child) => ({
    child,
    posts: (postsByChild[child.id] ?? []).filter((post) => dayKey(new Date(post.created_at)) === dayKey(selected)),
  })).filter((entry) => entry.posts.length > 0);

  function changeMonth(delta: number) {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function goToday() {
    const now = new Date();
    setMonthCursor(now);
    setSelected(now);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    try {
      await request("/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          title: data.title, description: data.description || null,
          start_at: new Date(String(data.start_at)).toISOString(), all_day: data.all_day === "on",
        }),
      });
      formElement.reset();
      setShowForm(false);
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(eventId: string) {
    await request(`/calendar-events/${eventId}`, { method: "DELETE" });
    void load();
  }

  const defaultStartAt = (() => {
    const d = new Date(selected);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("Calendrier")}</h1>
        {!parentChildren && (
          <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>{t("Nouvel événement")}</button>
        )}
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button type="button" className="button secondary small" onClick={() => changeMonth(-1)} aria-label={t("Mois précédent")}>‹</button>
          <button type="button" className="button secondary small" onClick={goToday}>{t("Aujourd’hui")}</button>
          <button type="button" className="button secondary small" onClick={() => changeMonth(1)} aria-label={t("Mois suivant")}>›</button>
        </div>
        <strong className="calendar-month-label">
          {monthCursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </strong>
      </div>

      {showForm && (
        <form className="panel inline-form" onSubmit={submit}>
          <label>{t("Titre")}<input name="title" required /></label>
          <label>{t("Description")}<textarea name="description" /></label>
          <label>{t("Date et heure de début")}<input name="start_at" type="datetime-local" defaultValue={defaultStartAt} required /></label>
          <label className="check"><input name="all_day" type="checkbox" /> {t("Toute la journée")}</label>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => setShowForm(false)}>{t("Annuler")}</button>
            <button className="button" disabled={busy}>{t("Ajouter")}</button>
          </div>
        </form>
      )}

      <div className="calendar-grid">
        {Array.from({ length: 7 }, (_, i) => {
          const sample = new Date(2024, 0, 1 + i); // a known Monday-start week, for weekday labels only
          return <div className="calendar-weekday" key={i}>{sample.toLocaleDateString(locale, { weekday: "short" })}</div>;
        })}
        {days.map((day) => {
          const inMonth = day.getMonth() === monthCursor.getMonth();
          const isToday = dayKey(day) === dayKey(today);
          const isSelected = dayKey(day) === dayKey(selected);
          const dayEvents = eventsByDay.get(dayKey(day)) ?? [];
          return (
            <button
              type="button"
              key={day.toISOString()}
              className={["calendar-cell", !inMonth && "dim", isToday && "today", isSelected && "selected"].filter(Boolean).join(" ")}
              onClick={() => setSelected(day)}
            >
              <span className="calendar-cell-num">{day.getDate()}</span>
              {dayEvents.length > 0 && <span className="calendar-cell-dots">{dayEvents.slice(0, 3).map((e) => <i key={e.id} />)}</span>}
            </button>
          );
        })}
      </div>

      <div className="event-list">
        <h2 className="calendar-selected-label">
          {selected.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        {eventsLoading && <p className="empty">{t("Chargement…")}</p>}
        {!eventsLoading && selectedEvents.map((event) => (
          <div className="panel event-row" key={event.id}>
            <div className="event-row-head">
              <strong>{event.title}</strong>
              {!parentChildren && <button type="button" className="text-link" onClick={() => remove(event.id)}>{t("Supprimer")}</button>}
            </div>
            <small>{event.all_day ? t("Toute la journée") : new Date(event.start_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</small>
            {event.description && <p>{event.description}</p>}
          </div>
        ))}
        {!eventsLoading && !selectedEvents.length && !parentChildren && <p className="empty">{t("Aucun événement ce jour.")}</p>}

        {selectedPostsByChild.map(({ child, posts }) => (
          <div className="calendar-day-child-feed" key={child.id}>
            {parentChildren && parentChildren.length > 1 && <h3 className="calendar-day-child-name">{child.first_name}</h3>}
            {posts.map((post) => <PostCard key={post.id} post={post} lang={lang} />)}
          </div>
        ))}
        {parentChildren && !eventsLoading && !selectedEvents.length && !selectedPostsByChild.length && (
          <p className="empty">{t("Aucune communication ce jour.")}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- team

function TeamPage() {
  const { t } = useLang();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [role, setRole] = useState<"educator" | "owner">("educator");
  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => request<{ members: StaffMember[]; invites: StaffInvite[] }>("/staff").then((r) => { setMembers(r.members); setInvites(r.invites); });
  useEffect(() => {
    void load();
    void request<Classroom[]>("/classrooms").then(setClassrooms);
  }, []);

  function classroomNames(ids: string[] | undefined): string {
    if (!ids || !ids.length) return "";
    return ids.map((id) => classrooms.find((c) => c.id === id)?.name).filter(Boolean).join(", ");
  }

  function toggleClassroom(id: string) {
    setClassroomIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    try {
      await request("/staff/invites", {
        method: "POST",
        body: JSON.stringify({ email: data.email, role: data.role, classroom_ids: role === "educator" ? classroomIds : [] }),
      });
      formElement.reset();
      setClassroomIds([]);
      setRole("educator");
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>{t("Équipe")}</h1>
      <form className="panel inline-form" onSubmit={submit}>
        <label>{t("Adresse courriel")}<input name="email" type="email" required /></label>
        <label>
          {t("Rôle")}
          <select name="role" value={role} onChange={(e) => setRole(e.target.value as "educator" | "owner")}>
            <option value="educator">{t("Éducateur/trice")}</option>
            <option value="owner">{t("Propriétaire")}</option>
          </select>
        </label>
        {role === "educator" && (
          <fieldset className="classroom-picker">
            <legend>{t("Classes assignées")}</legend>
            {classrooms.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={classroomIds.includes(c.id)} onChange={() => toggleClassroom(c.id)} />
                {c.name}
              </label>
            ))}
            {!classrooms.length && <p className="empty small">{t("Aucune classe pour l’instant.")}</p>}
          </fieldset>
        )}
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={busy}>{t("Inviter un membre du personnel")}</button>
      </form>
      <h3>{t("Membres")}</h3>
      <div className="cards-grid">
        {members.map((m) => (
          <div className="panel" key={m.user_id}>
            <strong>{m.full_name || m.email}</strong>
            <p>{t(m.role === "owner" ? "Propriétaire" : "Éducateur/trice")}</p>
            {m.role === "educator" && <p className="empty small">{classroomNames(m.classroom_ids) || t("Aucune classe assignée")}</p>}
          </div>
        ))}
      </div>
      {invites.length > 0 && (
        <>
          <h3>{t("Invitations en attente")}</h3>
          <div className="cards-grid">
            {invites.map((i) => (
              <div className="panel" key={i.id}>
                <strong>{i.email}</strong>
                {i.role === "educator" && <p className="empty small">{classroomNames(i.classroom_ids) || t("Aucune classe assignée")}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- invite acceptance

function AcceptInvite({ kind }: { kind: "staff" | "parent" }) {
  const { t } = useLang();
  const { token } = useParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [allowed, setAllowed] = useState<boolean | null>(authConfigured ? null : true);

  useEffect(() => {
    if (!authConfigured) return;
    authProvider.isAuthenticated().then(setAllowed);
  }, []);

  useEffect(() => {
    if (allowed === null) return;
    if (!allowed) {
      nav(`/login?next=/${kind === "staff" ? "staff-invite" : "parent-invite"}/${token}`);
      return;
    }
    request(`/auth/accept-${kind}-invite`, { method: "POST", body: JSON.stringify({ token }) })
      .then(() => nav("/app"))
      .catch(() => setStatus("error"));
  }, [allowed, kind, nav, token]);

  if (status === "error") return <div className="page"><p className="error">{t("Invitation invalide ou expirée.")}</p></div>;
  return <SlowLoad />;
}

// ---------------------------------------------------------------- protected gate

/** Same "Chargement…" everywhere, but after a few seconds it explains
 * *why* — Render's free backend plan sleeps after inactivity, and the
 * first request waking it back up can take 30-50s. A bare spinner that
 * long reads as broken; this one at least tells you it isn't. */
function SlowLoad() {
  const { t } = useLang();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="page">
      <p>{t("Chargement…")}</p>
      {slow && <p className="empty small">{t("Le serveur gratuit se réveille — ça peut prendre jusqu’à une minute après une pause. Merci de patienter.")}</p>}
    </div>
  );
}

function Protected() {
  const [allowed, setAllowed] = useState<boolean | null>(authConfigured ? null : true);
  useEffect(() => {
    if (!authConfigured) return;
    authProvider.isAuthenticated().then(setAllowed);
  }, []);

  const [member, setMember] = useState<Member | null | "none">(null);
  useEffect(() => {
    if (allowed !== true) return;
    request<Member>("/auth/me").then(setMember).catch(() => setMember("none"));
  }, [allowed]);

  if (allowed === null) return <SlowLoad />;
  if (!allowed) return <Navigate to="/login" replace />;
  if (member === null) return <SlowLoad />;
  if (member === "none") return <CreateInstitution onCreated={setMember} />;
  if (member.kind === "staff") return <StaffShell member={member} />;
  return <ParentShell member={member} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/register" element={<Auth register />} />
        <Route path="/staff-invite/:token" element={<AcceptInvite kind="staff" />} />
        <Route path="/parent-invite/:token" element={<AcceptInvite kind="parent" />} />
        <Route path="/app/*" element={<Protected />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
