import { createContext, useContext, useEffect, useState, type ReactNode, createElement } from "react";

// Same retrofitting-friendly approach as Fidli's i18n.ts, generalized to
// three languages instead of two: French is the source of truth and the
// dictionary key — t("Se connecter") returns the French text unchanged
// when lang is "fr", and looks it up in the "ar" or "en" dictionary
// otherwise, falling back to French for anything not yet translated.
export type Lang = "fr" | "ar" | "en";

const STORAGE_KEY = "sanad-lang";

const ar: Record<string, string> = {
  "Se connecter": "تسجيل الدخول",
  "S’inscrire": "إنشاء حساب",
  "Créer votre compte": "أنشئ حسابك",
  "Heureux de vous revoir": "أهلاً بعودتك",
  "Continuer avec Google": "المتابعة عبر Google",
  "ou": "أو",
  "Adresse courriel": "البريد الإلكتروني",
  "Mot de passe": "كلمة المرور",
  "Confirmer le mot de passe": "تأكيد كلمة المرور",
  "Mot de passe oublié ?": "نسيت كلمة المرور؟",
  "Déjà inscrit ?": "لديك حساب بالفعل؟",
  "Pas encore de compte ?": "ليس لديك حساب بعد؟",
  "Nom de l’établissement": "اسم المؤسسة",
  "Type d’établissement": "نوع المؤسسة",
  "École": "مدرسة",
  "Garderie": "حضانة",
  "Créer mon établissement": "إنشاء مؤسستي",
  "Bienvenue sur Sanad": "مرحبًا بك في سند",
  "La plateforme qui relie votre établissement et les parents, au quotidien.": "المنصة التي تربط مؤسستكم بالأولياء، يومًا بعد يوم.",
  "Photos, calendrier, repas, commentaires : tout au même endroit, pour chaque enfant.": "صور، تقويم، وجبات، تعليقات: كل شيء في مكان واحد، لكل طفل.",
  "Commencer": "البدء",
  "Nous contacter": "تواصل معنا",
  "Aperçu": "نظرة عامة",
  "Enfants": "الأطفال",
  "Classes": "الأقسام",
  "Calendrier": "التقويم",
  "Équipe": "الفريق",
  "Déconnexion": "تسجيل الخروج",
  "Chargement…": "جارٍ التحميل…",
  "Ajouter un enfant": "إضافة طفل",
  "Prénom": "الاسم",
  "Nom": "اللقب",
  "Date de naissance": "تاريخ الميلاد",
  "Classe": "القسم",
  "Aucune classe": "بدون قسم",
  "Ajouter": "إضافة",
  "Annuler": "إلغاء",
  "Aucun enfant pour l’instant.": "لا يوجد أطفال بعد.",
  "Retirer": "إزالة",
  "Réactiver": "إعادة تفعيل",
  "Actif": "نشط",
  "Inactif": "غير نشط",
  "Retirer cet enfant ? Son historique est conservé.": "إزالة هذا الطفل؟ سيتم الاحتفاظ بسجله.",
  "Classes assignées": "الأقسام المسندة",
  "Aucune classe assignée": "لا يوجد قسم مسند",
  "Ajoutez votre première classe": "أضف أول قسم",
  "Nom de la classe": "اسم القسم",
  "Groupe d’âge": "الفئة العمرية",
  "Ex. 2-3 ans": "مثال: 2-3 سنوات",
  "Aucune classe pour l’instant.": "لا توجد أقسام بعد.",
  "Retour": "رجوع",
  "Inviter un parent": "دعوة ولي أمر",
  "Lien d’invitation créé — envoyez-le au parent :": "تم إنشاء رابط الدعوة — أرسله لولي الأمر:",
  "Copier le lien": "نسخ الرابط",
  "Lien copié ✓": "تم نسخ الرابط ✓",
  "Relation": "الصلة",
  "Mère": "الأم",
  "Père": "الأب",
  "Tuteur/tutrice": "الوصي",
  "Fil d’actualité": "سجل النشاط",
  "Écrire une note…": "اكتب ملاحظة…",
  "Choisir une photo": "اختيار صورة",
  "Envoi…": "جارٍ الإرسال…",
  "Choisissez une photo avant de publier.": "اختر صورة قبل النشر.",
  "Publier une photo": "نشر صورة",
  "Publier une note": "نشر ملاحظة",
  "Repas": "الوجبة",
  "A tout mangé": "أكل كل شيء",
  "A mangé un peu": "أكل قليلاً",
  "A refusé": "رفض الأكل",
  "Publier le repas": "نشر الوجبة",
  "Photo": "صورة",
  "Note": "ملاحظة",
  "Sieste": "قيلولة",
  "Activité": "نشاط",
  "Annonce": "إعلان",
  "Aucune publication pour le moment.": "لا يوجد منشورات بعد.",
  "Écrire un commentaire…": "اكتب تعليقًا…",
  "Envoyer": "إرسال",
  "Aucun commentaire.": "لا توجد تعليقات.",
  "Nouvel événement": "حدث جديد",
  "Titre": "العنوان",
  "Description": "الوصف",
  "Date et heure de début": "تاريخ ووقت البداية",
  "Toute la journée": "طوال اليوم",
  "Aucun événement pour l’instant.": "لا توجد أحداث بعد.",
  "Aucun événement ce jour.": "لا توجد أحداث في هذا اليوم.",
  "Aujourd’hui": "اليوم",
  "Mois précédent": "الشهر السابق",
  "Mois suivant": "الشهر التالي",
  "Supprimer": "حذف",
  "Inviter un membre du personnel": "دعوة عضو من الفريق",
  "Rôle": "الدور",
  "Propriétaire": "المالك",
  "Éducateur/trice": "مربّي/ة",
  "Membres": "الأعضاء",
  "Invitations en attente": "دعوات قيد الانتظار",
  "Mes enfants": "أطفالي",
  "Vous n’avez pas encore d’enfant lié à votre compte.": "لا يوجد طفل مرتبط بحسابك بعد.",
  "Invitation invalide ou expirée.": "الدعوة غير صالحة أو منتهية الصلاحية.",
  "Invitation acceptée ✓": "تم قبول الدعوة ✓",
  "Voir le fil": "عرض السجل",
};

const en: Record<string, string> = {
  "Se connecter": "Log in",
  "S’inscrire": "Sign up",
  "Créer votre compte": "Create your account",
  "Heureux de vous revoir": "Welcome back",
  "Continuer avec Google": "Continue with Google",
  "ou": "or",
  "Adresse courriel": "Email address",
  "Mot de passe": "Password",
  "Confirmer le mot de passe": "Confirm password",
  "Mot de passe oublié ?": "Forgot password?",
  "Déjà inscrit ?": "Already have an account?",
  "Pas encore de compte ?": "Don’t have an account yet?",
  "Nom de l’établissement": "Institution name",
  "Type d’établissement": "Institution type",
  "École": "School",
  "Garderie": "Daycare",
  "Créer mon établissement": "Create my institution",
  "Bienvenue sur Sanad": "Welcome to Sanad",
  "La plateforme qui relie votre établissement et les parents, au quotidien.": "The platform that connects your institution and parents, every day.",
  "Photos, calendrier, repas, commentaires : tout au même endroit, pour chaque enfant.": "Photos, calendar, meals, comments: all in one place, for every child.",
  "Commencer": "Get started",
  "Nous contacter": "Contact us",
  "Aperçu": "Overview",
  "Enfants": "Children",
  "Classes": "Classrooms",
  "Calendrier": "Calendar",
  "Équipe": "Team",
  "Déconnexion": "Log out",
  "Chargement…": "Loading…",
  "Ajouter un enfant": "Add a child",
  "Prénom": "First name",
  "Nom": "Last name",
  "Date de naissance": "Date of birth",
  "Classe": "Classroom",
  "Aucune classe": "No classroom",
  "Ajouter": "Add",
  "Annuler": "Cancel",
  "Aucun enfant pour l’instant.": "No children yet.",
  "Retirer": "Remove",
  "Réactiver": "Reactivate",
  "Actif": "Active",
  "Inactif": "Inactive",
  "Retirer cet enfant ? Son historique est conservé.": "Remove this child? Their history is kept.",
  "Classes assignées": "Assigned classrooms",
  "Aucune classe assignée": "No classroom assigned",
  "Ajoutez votre première classe": "Add your first classroom",
  "Nom de la classe": "Classroom name",
  "Groupe d’âge": "Age group",
  "Ex. 2-3 ans": "E.g. 2-3 years",
  "Aucune classe pour l’instant.": "No classrooms yet.",
  "Retour": "Back",
  "Inviter un parent": "Invite a parent",
  "Lien d’invitation créé — envoyez-le au parent :": "Invitation link created — send it to the parent:",
  "Copier le lien": "Copy link",
  "Lien copié ✓": "Link copied ✓",
  "Relation": "Relationship",
  "Mère": "Mother",
  "Père": "Father",
  "Tuteur/tutrice": "Guardian",
  "Fil d’actualité": "Activity feed",
  "Écrire une note…": "Write a note…",
  "Choisir une photo": "Choose a photo",
  "Envoi…": "Uploading…",
  "Choisissez une photo avant de publier.": "Choose a photo before posting.",
  "Publier une photo": "Post a photo",
  "Publier une note": "Post a note",
  "Repas": "Meal",
  "A tout mangé": "Ate everything",
  "A mangé un peu": "Ate a little",
  "A refusé": "Refused to eat",
  "Publier le repas": "Post the meal",
  "Photo": "Photo",
  "Note": "Note",
  "Sieste": "Nap",
  "Activité": "Activity",
  "Annonce": "Announcement",
  "Aucune publication pour le moment.": "No posts yet.",
  "Écrire un commentaire…": "Write a comment…",
  "Envoyer": "Send",
  "Aucun commentaire.": "No comments.",
  "Nouvel événement": "New event",
  "Titre": "Title",
  "Description": "Description",
  "Date et heure de début": "Start date and time",
  "Toute la journée": "All day",
  "Aucun événement pour l’instant.": "No events yet.",
  "Aucun événement ce jour.": "No events this day.",
  "Aujourd’hui": "Today",
  "Mois précédent": "Previous month",
  "Mois suivant": "Next month",
  "Supprimer": "Delete",
  "Inviter un membre du personnel": "Invite a staff member",
  "Rôle": "Role",
  "Propriétaire": "Owner",
  "Éducateur/trice": "Educator",
  "Membres": "Members",
  "Invitations en attente": "Pending invitations",
  "Mes enfants": "My children",
  "Vous n’avez pas encore d’enfant lié à votre compte.": "You don’t have a child linked to your account yet.",
  "Invitation invalide ou expirée.": "Invalid or expired invitation.",
  "Invitation acceptée ✓": "Invitation accepted ✓",
  "Voir le fil": "View feed",
};

const dictionaries: Record<Lang, Record<string, string>> = { fr: {}, ar, en };

export function translate(lang: Lang, text: string): string {
  if (lang === "fr") return text;
  return dictionaries[lang][text] ?? text;
}

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "ar" || stored === "en") return stored;
  } catch {
    // localStorage unavailable — fall through to default.
  }
  try {
    const browser = (navigator.language || "").toLowerCase();
    if (browser.startsWith("ar")) return "ar";
    if (browser.startsWith("en")) return "en";
  } catch {
    // navigator unavailable — fall through to default.
  }
  return "fr";
}

const LanguageContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: (text: string) => string; dir: "ltr" | "rtl" }>({
  lang: "fr",
  setLang: () => {},
  t: (text: string) => text,
  dir: "ltr",
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [lang, dir]);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only.
    }
  };
  const t = (text: string) => translate(lang, text);
  return createElement(LanguageContext.Provider, { value: { lang, setLang, t, dir } }, children);
}

export function useLang() {
  return useContext(LanguageContext);
}
