import { authConfigured, authProvider } from "./auth";

export const API = (import.meta.env.VITE_API_URL as string) || "http://localhost:8080/api/v1";

function currentLang(): string {
  try {
    const stored = localStorage.getItem("sanad-lang");
    if (stored === "fr" || stored === "ar" || stored === "en") return stored;
  } catch {
    // ignore
  }
  return "fr";
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("Accept-Language", currentLang());
  if (authConfigured) {
    const { data } = await authProvider.getSession();
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  } else {
    // Demo mode (no Firebase configured): the backend accepts three fixed
    // bearer tokens (see backend/app/controllers/access.py), one per role.
    // Flipping localStorage["sanad-demo-role"] to "parent" or "educator" in
    // the browser console lets you exercise that experience locally
    // without a second real account — e.g.
    // localStorage.setItem("sanad-demo-role", "educator") then reload.
    const role = localStorage.getItem("sanad-demo-role");
    const token = role === "parent" ? "demo-parent-token" : role === "educator" ? "demo-educator-token" : "demo-owner-token";
    headers.set("Authorization", `Bearer ${token}`);
  }
  const r = await fetch(`${API}${path}`, { ...options, headers });
  if (!r.ok) {
    const d = await r.json().catch(() => ({ detail: "Une erreur est survenue" }));
    throw new Error(typeof d.detail === "string" ? d.detail : "Une erreur est survenue");
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

// The backend's origin without the /api/v1 suffix — /uploads/<file> is
// mounted directly on the app, not under the API prefix (see
// backend/app/main.py), so it needs to be reached without that prefix too.
const API_ORIGIN = API.replace(/\/api\/v1\/?$/, "");

/** Turns a post's media_url into something an <img> can load: a relative
 * "/uploads/..." path (this backend's own local-disk storage — see
 * backend/app/media.py) is resolved against the API's origin; anything
 * else (a future real CDN/storage URL) is assumed already absolute. */
export function mediaUrl(path: string): string {
  return path.startsWith("/") ? `${API_ORIGIN}${path}` : path;
}

export async function uploadPhoto(file: File): Promise<{ path: string }> {
  const body = new FormData();
  body.append("file", file);
  return request<{ path: string }>("/uploads", { method: "POST", body });
}

export type Institution = {
  kind: "staff";
  user_id: string;
  role: "owner" | "educator";
  institution_id: string;
  institution_name: string;
  institution_type: "school" | "daycare";
  slug: string;
  status: string;
  primary_color: string;
  logo_url?: string;
};

export type ParentProfile = {
  kind: "parent";
  user_id: string;
  email?: string;
  children: Child[];
};

export type Member = Institution | ParentProfile;

export type Classroom = { id: string; institution_id: string; name: string; age_group?: string };

export type Child = {
  id: string;
  institution_id: string;
  classroom_id?: string;
  first_name: string;
  last_name: string;
  birth_date?: string;
  photo_url?: string;
  notes?: string;
  active: boolean;
};

export type Post = {
  id: string;
  institution_id: string;
  child_id?: string;
  classroom_id?: string;
  author_user_id: string;
  author_name: string;
  type: "photo" | "note" | "meal" | "nap" | "activity" | "announcement";
  caption?: string;
  media_url?: string;
  meal_status?: "ate_all" | "ate_some" | "refused";
  created_at: string;
};

export type Comment = {
  id: string;
  post_id: string;
  author_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  institution_id: string;
  classroom_id?: string;
  title: string;
  description?: string;
  start_at: string;
  end_at?: string;
  all_day: boolean;
};

export type StaffInvite = { id: string; email: string; role: "owner" | "educator"; token: string };
export type StaffMember = { user_id: string; role: "owner" | "educator"; email?: string; full_name?: string };
