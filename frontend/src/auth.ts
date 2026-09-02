import { initializeApp } from "firebase/app";
import {
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  setPersistence,
  updatePassword,
  verifyPasswordResetCode,
  type User,
} from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
};

export const authConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
const firebaseApp = initializeApp(authConfigured ? config : {
  apiKey: "not-configured",
  authDomain: "not-configured.invalid",
  projectId: "not-configured",
  appId: "not-configured",
});
const firebaseAuth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const firebaseReady = setPersistence(firebaseAuth, browserLocalPersistence)
  .catch(() => undefined)
  .then(() => firebaseAuth.authStateReady());

function normalizedUser(user: User | null) {
  if (!user) return null;
  return { id: user.uid, email: user.email };
}

async function normalizedSession(user: User | null, forceRefresh = false) {
  if (!user) return null;
  return { access_token: await user.getIdToken(forceRefresh), user: normalizedUser(user) };
}

function resultError(error: unknown) {
  const raw = error as { code?: string; message?: string };
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "Un compte existe déjà avec cette adresse.",
    "auth/invalid-credential": "Adresse courriel ou mot de passe incorrect.",
    "auth/invalid-email": "L’adresse courriel n’est pas valide.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez un peu plus tard.",
    "auth/user-disabled": "Ce compte a été désactivé.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 8 caractères.",
    "auth/expired-action-code": "Ce lien a expiré. Demandez un nouveau lien.",
    "auth/invalid-action-code": "Ce lien de réinitialisation est invalide ou déjà utilisé.",
    "auth/popup-closed-by-user": "Fenêtre Google fermée avant la fin de la connexion.",
    "auth/popup-blocked": "Votre navigateur a bloqué la fenêtre Google. Autorisez les fenêtres popup et réessayez.",
    "auth/cancelled-popup-request": "Une autre connexion Google est déjà en cours.",
    "auth/account-exists-with-different-credential": "Un compte existe déjà avec cette adresse via un autre mode de connexion.",
  };
  return new Error(messages[raw.code || ""] || raw.message || "Erreur d’authentification.");
}

export const authProvider = {
  async signUp(input: { email: string; password: string }) {
    try {
      await firebaseReady;
      const credential = await createUserWithEmailAndPassword(firebaseAuth, input.email, input.password);
      return { data: { user: normalizedUser(credential.user), session: await normalizedSession(credential.user) }, error: null };
    } catch (error) {
      return { data: { user: null, session: null }, error: resultError(error) };
    }
  },
  async signInWithPassword(input: { email: string; password: string }) {
    try {
      await firebaseReady;
      const credential = await signInWithEmailAndPassword(firebaseAuth, input.email, input.password);
      return { data: { user: normalizedUser(credential.user), session: await normalizedSession(credential.user) }, error: null };
    } catch (error) {
      return { data: { user: null, session: null }, error: resultError(error) };
    }
  },
  async signInWithGoogle() {
    try {
      await firebaseReady;
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      return { data: { user: normalizedUser(credential.user), session: await normalizedSession(credential.user) }, error: null };
    } catch (error) {
      return { data: { user: null, session: null }, error: resultError(error) };
    }
  },
  async getSession(forceRefresh = false) {
    try {
      await firebaseReady;
      return { data: { session: await normalizedSession(firebaseAuth.currentUser, forceRefresh) }, error: null };
    } catch (error) {
      return { data: { session: null }, error: resultError(error) };
    }
  },
  async isAuthenticated() {
    await firebaseReady;
    return Boolean(firebaseAuth.currentUser);
  },
  onAuthStateChange(callback: (event: string, session: Awaited<ReturnType<typeof normalizedSession>>) => void) {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        callback("SIGNED_OUT", null);
        return;
      }
      try {
        callback("SIGNED_IN", await normalizedSession(user));
      } catch {
        callback("SIGNED_IN", { access_token: "", user: normalizedUser(user) });
      }
    });
    return { data: { subscription: { unsubscribe } } };
  },
  async signOut() {
    try {
      await firebaseReady;
      await signOut(firebaseAuth);
      return { error: null };
    } catch (error) {
      return { error: resultError(error) };
    }
  },
  async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
    try {
      await sendPasswordResetEmail(firebaseAuth, email, { url: options?.redirectTo || `${window.location.origin}/login` });
      return { error: null };
    } catch (error) {
      return { error: resultError(error) };
    }
  },
  async verifyPasswordResetCode(code: string) {
    try {
      return { data: await verifyPasswordResetCode(firebaseAuth, code), error: null };
    } catch (error) {
      return { data: null, error: resultError(error) };
    }
  },
  async updateUser(input: { password: string }) {
    try {
      const code = new URLSearchParams(window.location.search).get("oobCode");
      if (code) await confirmPasswordReset(firebaseAuth, code, input.password);
      else if (firebaseAuth.currentUser) await updatePassword(firebaseAuth.currentUser, input.password);
      else throw new Error("Le lien de réinitialisation est absent ou invalide.");
      return { error: null };
    } catch (error) {
      return { error: resultError(error) };
    }
  },
};
