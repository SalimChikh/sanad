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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Demo mode (no Firebase project wired up yet): there is no real sign-up
  // to do, and every request already carries a fixed demo bearer token
  // (see api.ts) regardless of what happens on this screen. Sending
  // someone here at all — e.g. via the landing page's "S'inscrire" link —
  // would be a dead end once they submit, so skip straight past it instead.
  useEffect(() => {
    if (!authConfigured) nav("/app", { replace: true });
  }, [nav]);

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
      nav("/app");
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
      nav("/app");
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
            <>{t("Déjà inscrit ?")} <Link to="/login">{t("Se connecter")}</Link></>
          ) : (
            <>{t("Pas encore de compte ?")} <Link to="/register">{t("S’inscrire")}</Link></>
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
          <Route path="calendar" element={<CalendarPage />} />
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
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => request<Child[]>("/children").then(setChildren);
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
          birth_date: data.birth_date || null,
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
          <label>{t("Date de naissance")}<input name="birth_date" type="date" /></label>
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
          <Link className="panel child-card" key={child.id} to={`/app/children/${child.id}`}>
            <span className="avatar">{child.first_name[0]}</span>
            <strong>{child.first_name} {child.last_name}</strong>
          </Link>
        ))}
        {!children.length && <p className="empty">{t("Aucun enfant pour l’instant.")}</p>}
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
  photo: "Photo", note: "Note", meal: "Repas", nap: "Sieste", activity: "Activité", announcement: "Annonce",
};

function ChildDetail({ canPost }: { canPost: boolean }) {
  const { t, lang } = useLang();
  const { childId } = useParams();
  const [child, setChild] = useState<Child | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const loadFeed = () => request<Post[]>(`/feed?child_id=${childId}`).then(setPosts).catch((e) => setError((e as Error).message));
  useEffect(() => {
    if (!childId) return;
    request<Child>(`/children/${childId}`).then(setChild).catch((e) => setError((e as Error).message));
    void loadFeed();
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
          <button type="button" className="button secondary" onClick={() => setInviteOpen((v) => !v)}>
            {t("Inviter un parent")}
          </button>
        )}
      </div>
      {inviteOpen && childId && <ParentInvitePanel childId={childId} onClose={() => setInviteOpen(false)} />}
      {canPost && childId && <PostComposer childId={childId} onPosted={loadFeed} />}
      {error && <p className="error">{error}</p>}
      <div className="feed">
        {posts.map((post) => <PostCard key={post.id} post={post} lang={lang} />)}
        {!posts.length && <p className="empty">{t("Aucune publication pour le moment.")}</p>}
      </div>
    </div>
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

export function PostComposer({ childId, onPosted }: { childId: string; onPosted: () => void }) {
  const { t } = useLang();
  const [tab, setTab] = useState<"note" | "photo" | "meal">("note");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [uploading, setUploading] = useState(false);

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show the chosen file immediately via a local object URL — no need to
    // wait for the round-trip to the server just to confirm what was picked.
    setPhotoPreview(URL.createObjectURL(file));
    setError("");
    setUploading(true);
    try {
      const { path } = await uploadPhoto(file);
      setPhotoPath(path);
    } catch (e) {
      setError((e as Error).message);
      setPhotoPreview("");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tab === "photo" && !photoPath) {
      setError(t("Choisissez une photo avant de publier."));
      return;
    }
    setBusy(true);
    setError("");
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    try {
      const body: Record<string, unknown> = { child_id: childId };
      if (tab === "note") { body.type = "note"; body.caption = data.caption; }
      if (tab === "photo") { body.type = "photo"; body.caption = data.caption; body.media_url = photoPath; }
      if (tab === "meal") { body.type = "meal"; body.meal_status = data.meal_status; body.caption = data.caption; }
      await request("/posts", { method: "POST", body: JSON.stringify(body) });
      formElement.reset();
      setPhotoPath("");
      setPhotoPreview("");
      onPosted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel composer" onSubmit={submit}>
      <div className="segmented">
        <button type="button" className={tab === "note" ? "active" : ""} onClick={() => setTab("note")}>{t("Note")}</button>
        <button type="button" className={tab === "photo" ? "active" : ""} onClick={() => setTab("photo")}><Camera size={14} /> {t("Photo")}</button>
        <button type="button" className={tab === "meal" ? "active" : ""} onClick={() => setTab("meal")}>{t("Repas")}</button>
      </div>
      {tab === "note" && <textarea name="caption" placeholder={t("Écrire une note…")} required />}
      {tab === "photo" && (
        <>
          <label className="photo-picker">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} hidden />
            {photoPreview ? <img src={photoPreview} alt="" /> : <span><Camera size={20} /> {t("Choisir une photo")}</span>}
            {uploading && <span className="uploading-badge">{t("Envoi…")}</span>}
          </label>
          <textarea name="caption" placeholder={t("Écrire une note…")} />
        </>
      )}
      {tab === "meal" && (
        <>
          <select name="meal_status" defaultValue="ate_all">
            <option value="ate_all">{t("A tout mangé")}</option>
            <option value="ate_some">{t("A mangé un peu")}</option>
            <option value="refused">{t("A refusé")}</option>
          </select>
          <textarea name="caption" placeholder={t("Écrire une note…")} />
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy || uploading}>
        {tab === "note" ? t("Publier une note") : tab === "photo" ? t("Publier une photo") : t("Publier le repas")}
      </button>
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
      {post.media_url && <img className="post-photo" src={mediaUrl(post.media_url)} alt="" />}
      {post.meal_status && (
        <p className="meal-status">
          {post.meal_status === "ate_all" ? t("A tout mangé") : post.meal_status === "ate_some" ? t("A mangé un peu") : t("A refusé")}
        </p>
      )}
      {post.caption && <p>{post.caption}</p>}
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
  const [busy, setBusy] = useState(false);
  const load = () => request<Classroom[]>("/classrooms").then(setClassrooms);
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
        {!classrooms.length && <p className="empty">{t("Aucune classe pour l’instant.")}</p>}
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

export function CalendarPage() {
  const { t, lang } = useLang();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-CA" : "fr-CA";
  const load = () => request<CalendarEvent[]>("/calendar-events").then(setEvents);
  useEffect(() => { void load(); }, []);

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
        <button type="button" className="button" onClick={() => setShowForm((v) => !v)}>{t("Nouvel événement")}</button>
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
        {selectedEvents.map((event) => (
          <div className="panel event-row" key={event.id}>
            <div className="event-row-head">
              <strong>{event.title}</strong>
              <button type="button" className="text-link" onClick={() => remove(event.id)}>{t("Supprimer")}</button>
            </div>
            <small>{event.all_day ? t("Toute la journée") : new Date(event.start_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</small>
            {event.description && <p>{event.description}</p>}
          </div>
        ))}
        {!selectedEvents.length && <p className="empty">{t("Aucun événement ce jour.")}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- team

function TeamPage() {
  const { t } = useLang();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => request<{ members: StaffMember[]; invites: StaffInvite[] }>("/staff").then((r) => { setMembers(r.members); setInvites(r.invites); });
  useEffect(() => { void load(); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const formElement = e.currentTarget;
    const data = Object.fromEntries(new FormData(formElement));
    try {
      await request("/staff/invites", { method: "POST", body: JSON.stringify({ email: data.email, role: data.role }) });
      formElement.reset();
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
          <select name="role" defaultValue="educator">
            <option value="educator">{t("Éducateur/trice")}</option>
            <option value="owner">{t("Propriétaire")}</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={busy}>{t("Inviter un membre du personnel")}</button>
      </form>
      <h3>{t("Membres")}</h3>
      <div className="cards-grid">
        {members.map((m) => <div className="panel" key={m.user_id}><strong>{m.full_name || m.email}</strong><p>{t(m.role === "owner" ? "Propriétaire" : "Éducateur/trice")}</p></div>)}
      </div>
      {invites.length > 0 && (
        <>
          <h3>{t("Invitations en attente")}</h3>
          <div className="cards-grid">
            {invites.map((i) => <div className="panel" key={i.id}><strong>{i.email}</strong></div>)}
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
  return <div className="page"><p>{t("Chargement…")}</p></div>;
}

// ---------------------------------------------------------------- protected gate

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

  if (allowed === null) return <div className="page"><p>Chargement…</p></div>;
  if (!allowed) return <Navigate to="/login" replace />;
  if (member === null) return <div className="page"><p>Chargement…</p></div>;
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
