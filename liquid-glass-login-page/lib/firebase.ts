import { initializeApp, getApps, getApp } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth"
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore"

// ── Firebase config ───────────────────────────────────────────────────────────
// All values read from NEXT_PUBLIC_ env vars — safe to use in browser.
// Must be set in .env.local (local) and Vercel Environment Variables (production).
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// ── Singleton init ────────────────────────────────────────────────────────────
// Safe for Next.js SSR/build: Firebase Auth and Firestore are only fully
// initialized when the API key is present (browser + Vercel runtime).
// During static generation of pages like /_not-found the key is absent,
// so we use a named dummy app that never makes real network calls.
function getFirebaseApp() {
  const hasKey = typeof firebaseConfig.apiKey === "string" && firebaseConfig.apiKey.length > 10

  if (!hasKey) {
    // Build/SSR with no real key — return a stub so imports don't crash
    const STUB = "build-stub"
    const existing = getApps().find(a => a.name === STUB)
    if (existing) return existing
    return initializeApp(
      { apiKey: "stub", projectId: "stub", appId: "stub" },
      STUB
    )
  }

  // Real key available (browser or Vercel with env vars set)
  if (getApps().find(a => a.name === "[DEFAULT]")) return getApp()
  return initializeApp(firebaseConfig)
}

const _app = getFirebaseApp()

// auth and db are only fully functional when a real API key is present.
// Client components (AuthProvider etc.) always run in the browser where the
// real key is available via NEXT_PUBLIC_ inlining.
export const auth = (() => {
  try { return getAuth(_app) } catch { return null as any }
})()

export const db = (() => {
  try { return getFirestore(_app) } catch { return null as any }
})()

export { onAuthStateChanged }
export type { User, Timestamp }

// ── Auth providers ────────────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider()

export async function signInGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  await ensureUserDoc(result.user)
  setSessionCookie(result.user.uid)
  return result.user
}

/**
 * Sign in with email + password.
 * Rejects if the user's email is not verified (email/password accounts only).
 * Returns the user on success.
 */
export async function signInEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  // Reload to get the latest emailVerified status from Firebase
  await reload(result.user)
  if (!result.user.emailVerified) {
    // Sign them out immediately — unverified users cannot access the app
    await signOut(auth)
    clearSessionCookie()
    const err: any = new Error("Please verify your email before signing in.")
    err.code = "auth/email-not-verified"
    throw err
  }
  setSessionCookie(result.user.uid)
  return result.user
}

/**
 * Sign up with email + password.
 * Creates the user, saves Firestore profile, sends verification email.
 * Does NOT set the session cookie — user must verify email first.
 */
export async function signUpEmail(
  name: string,
  email: string,
  password: string,
  role: "candidate" | "manager" = "candidate"
) {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(result.user, { displayName: name })
  await ensureUserDoc(result.user, role, name)
  // Send verification email immediately
  await sendEmailVerification(result.user)
  // Sign out — they must verify email before accessing the app
  await signOut(auth)
  clearSessionCookie()
  return result.user
}

/** Resend verification email to a signed-in but unverified user */
export async function resendVerificationEmail(email: string, password: string) {
  // Re-authenticate to get a fresh user object
  const result = await signInWithEmailAndPassword(auth, email, password)
  await sendEmailVerification(result.user)
  await signOut(auth)
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email)
}

export async function logout() {
  clearSessionCookie()
  await signOut(auth)
}

async function ensureUserDoc(
  user: User,
  role: "candidate" | "manager" = "candidate",
  name?: string
) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      name: name ?? user.displayName ?? "User",
      email: user.email,
      role,
      createdAt: serverTimestamp(),
    });
  }
}

export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function saveResume(uid: string, data: ResumeData) {
  await setDoc(doc(db, "resumes", uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getResume(uid: string): Promise<ResumeData | null> {
  const snap = await getDoc(doc(db, "resumes", uid));
  return snap.exists() ? (snap.data() as ResumeData) : null;
}

export async function createSession(
  session: Omit<InterviewSession, "id" | "createdAt">
) {
  const ref = await addDoc(collection(db, "sessions"), {
    ...session,
    createdAt: serverTimestamp(),
    status: "active",
    messages: [],
  });

  return ref.id;
}

export async function getSession(
  id: string
): Promise<InterviewSession | null> {
  const snap = await getDoc(doc(db, "sessions", id));

  return snap.exists()
    ? ({ id: snap.id, ...snap.data() } as InterviewSession)
    : null;
}

export async function appendMessage(
  sessionId: string,
  message: ChatMessage
) {
  const ref = doc(db, "sessions", sessionId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const messages: ChatMessage[] = snap.data().messages ?? [];

  messages.push({
    ...message,
    ts: Date.now(),
  });

  await updateDoc(ref, { messages });
}

export async function closeSession(
  sessionId: string,
  report: SessionReport
) {
  await updateDoc(doc(db, "sessions", sessionId), {
    status: "completed",
    report,
    completedAt: serverTimestamp(),
  });
}

export async function getUserSessions(
  uid: string
): Promise<InterviewSession[]> {
  try {
    const q = query(
      collection(db, "sessions"),
      where("candidateId", "==", uid)
    );

    const snap = await getDocs(q);

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }) as InterviewSession)
      .sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds ?? 0;
        const bTime = (b.createdAt as any)?.seconds ?? 0;

        return bTime - aTime;
      });
  } catch (err: any) {
    console.warn(
      "[getUserSessions] Firestore query failed:",
      err?.code,
      err?.message
    );

    return [];
  }
}

export async function getAllSessions(): Promise<InterviewSession[]> {
  try {
    const snap = await getDocs(collection(db, "sessions"));

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }) as InterviewSession)
      .sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds ?? 0;
        const bTime = (b.createdAt as any)?.seconds ?? 0;

        return bTime - aTime;
      });
  } catch (err: any) {
    console.warn(
      "[getAllSessions] Firestore query failed:",
      err?.code,
      err?.message
    );

    return [];
  }
}

export async function getAllCandidates(): Promise<UserProfile[]> {
  const q = query(
    collection(db, "users"),
    where("role", "==", "candidate")
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => d.data() as UserProfile);
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: "candidate" | "manager";
  createdAt: Timestamp;
}

export interface ResumeData {
  uid: string;
  rawText: string;
  name: string;
  skills: string[];
  languages: string[];
  frameworks: string[];
  experience: string[];
  projects: string[];
  education: string[];
  achievements: string[];
  score: number;
  summary: string;
}

export interface ChatMessage {
  role: "agent" | "candidate";
  content: string;
  score?: number;
  feedback?: string;
  ts?: number;
}

export interface InterviewSession {
  id: string;
  candidateId: string;
  candidateName: string;
  role: string;
  difficulty: string;
  status: "active" | "completed";
  messages: ChatMessage[];
  report?: SessionReport;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

export interface SessionReport {
  totalScore: number;
  technicalScore: number;
  communicationScore: number;
  questionsAsked: number;
  correctAnswers: number;
  strengths: string[];
  weaknesses: string[];
  improvements: ImprovementItem[];
  recommendation:
    | "Highly Recommended"
    | "Recommended"
    | "Needs Improvement"
    | "Not Ready Yet";
}

export interface ImprovementItem {
  topic: string;
  suggestion: string;
  resources: string[];
}

export function firebaseErrorMessage(err: any): string {
  const code: string = err?.code ?? "";

  const map: Record<string, string> = {
    "auth/invalid-api-key":
      "Firebase API key is invalid. Check your Firebase environment variables.",
    "auth/email-not-verified":
      "Please verify your email address before signing in. Check your inbox for the verification link.",
    "auth/app-not-authorized":
      "This domain is not authorized in Firebase. Add the domain in Firebase Authentication settings.",
    "auth/email-already-in-use":
      "This email is already registered. Please sign in instead.",
    "auth/invalid-email":
      "That doesn't look like a valid email address.",
    "auth/user-not-found":
      "No account found with this email.",
    "auth/wrong-password":
      "Incorrect password.",
    "auth/invalid-credential":
      "Incorrect email or password.",
    "auth/weak-password":
      "Password is too weak. Use at least 6 characters.",
    "auth/missing-password":
      "Please enter a password.",
    "auth/missing-email":
      "Please enter your email address.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a minute and try again.",
    "auth/network-request-failed":
      "Network error. Check your internet connection and try again.",
    "auth/popup-closed-by-user":
      "Sign-in window was closed. Please try again.",
    "auth/popup-blocked":
      "Popup blocked by your browser. Please allow popups for this site.",
    "auth/cancelled-popup-request":
      "Sign-in was cancelled.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email using a different sign-in method.",
    "permission-denied":
      "Database permission denied. Check your Firestore security rules.",
  };

  if (map[code]) return map[code];

  if (code) {
    return `Authentication error (${code}). Please try again.`;
  }

  return err?.message ?? "Something went wrong. Please try again.";
}

export function setSessionCookie(uid: string) {
  if (typeof document === "undefined") return;

  const expires = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toUTCString();

  document.cookie = `__session=${uid}; path=/; expires=${expires}; SameSite=Lax`;
}

export function clearSessionCookie() {
  if (typeof document === "undefined") return;

  document.cookie =
    "__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
}

export interface ScheduledInterview {
  id: string;
  candidateId: string;
  candidateName: string;
  managerId: string;
  managerName: string;
  role: string;
  difficulty: string;
  interviewType: string;
  scheduledStart: number;
  scheduledEnd: number;
  sessionId?: string;
  status:
    | "SCHEDULED"
    | "READY"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "EXPIRED"
    | "CANCELLED";
  createdAt: Timestamp;
}

export interface MonitoringEvent {
  sessionId: string;
  candidateId: string;
  type:
    | "FULLSCREEN_EXIT"
    | "TAB_SWITCH"
    | "WINDOW_BLUR"
    | "CAMERA_DISABLED"
    | "MICROPHONE_DISABLED"
    | "COPY_ATTEMPT"
    | "PASTE_ATTEMPT";
  ts: number;
  note?: string;
}

export async function createSchedule(
  data: Omit<ScheduledInterview, "id" | "createdAt" | "status">
): Promise<string> {
  const ref = await addDoc(collection(db, "scheduled_interviews"), {
    ...data,
    status: "SCHEDULED",
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

export async function getSchedule(
  id: string
): Promise<ScheduledInterview | null> {
  const snap = await getDoc(doc(db, "scheduled_interviews", id));

  return snap.exists()
    ? ({ id: snap.id, ...snap.data() } as ScheduledInterview)
    : null;
}

export async function updateScheduleStatus(
  id: string,
  status: ScheduledInterview["status"],
  extra?: Record<string, any>
) {
  await updateDoc(doc(db, "scheduled_interviews", id), {
    status,
    ...extra,
  });
}

export async function getUserSchedules(
  uid: string
): Promise<ScheduledInterview[]> {
  try {
    const q = query(
      collection(db, "scheduled_interviews"),
      where("candidateId", "==", uid)
    );

    const snap = await getDocs(q);

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }) as ScheduledInterview)
      .sort((a, b) => b.scheduledStart - a.scheduledStart);
  } catch (err: any) {
    console.warn(
      "[getUserSchedules]",
      err?.code,
      err?.message
    );

    return [];
  }
}

export async function getAllSchedules(): Promise<ScheduledInterview[]> {
  try {
    const snap = await getDocs(
      collection(db, "scheduled_interviews")
    );

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }) as ScheduledInterview)
      .sort((a, b) => b.scheduledStart - a.scheduledStart);
  } catch (err: any) {
    console.warn(
      "[getAllSchedules]",
      err?.code,
      err?.message
    );

    return [];
  }
}

export async function logMonitoringEvent(
  event: MonitoringEvent
): Promise<void> {
  try {
    await addDoc(collection(db, "monitoring_events"), {
      ...event,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal.
  }
}

export async function getMonitoringEvents(
  sessionId: string
): Promise<MonitoringEvent[]> {
  try {
    const q = query(
      collection(db, "monitoring_events"),
      where("sessionId", "==", sessionId)
    );

    const snap = await getDocs(q);

    return snap.docs.map(
      (d) => d.data() as MonitoringEvent
    );
  } catch {
    return [];
  }
}

export interface JobApproval {
  candidateId: string;
  candidateName: string;
  managerId: string;
  status: "APPROVED" | "REJECTED" | "ON_HOLD" | "PENDING";
  note: string;
  overallScore: number;
  role: string;
  updatedAt: Timestamp;
}

export async function saveApproval(
  approval: Omit<JobApproval, "updatedAt">
): Promise<void> {
  await setDoc(doc(db, "approvals", approval.candidateId), {
    ...approval,
    updatedAt: serverTimestamp(),
  });
}

export async function getApproval(
  candidateId: string
): Promise<JobApproval | null> {
  const snap = await getDoc(doc(db, "approvals", candidateId));

  return snap.exists()
    ? (snap.data() as JobApproval)
    : null;
}

export async function getAllApprovals(): Promise<JobApproval[]> {
  try {
    const snap = await getDocs(collection(db, "approvals"));

    return snap.docs.map(
      (d) => d.data() as JobApproval
    );
  } catch {
    return [];
  }
}

export interface ActivityLog {
  id?: string;
  managerId: string;
  managerName: string;
  action:
    | "CANDIDATE_APPROVED"
    | "CANDIDATE_REJECTED"
    | "INTERVIEW_SCHEDULED"
    | "INTERVIEW_RESCHEDULED"
    | "INTERVIEW_CANCELLED"
    | "REPORT_VIEWED"
    | "CANDIDATE_ON_HOLD";
  candidateId?: string;
  candidateName?: string;
  detail?: string;
  ts: number;
  createdAt?: Timestamp;
}

export async function logActivity(
  log: Omit<ActivityLog, "id" | "createdAt">
): Promise<void> {
  try {
    await addDoc(collection(db, "activity_logs"), {
      ...log,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal.
  }
}

export async function getActivityLogs(): Promise<ActivityLog[]> {
  try {
    const snap = await getDocs(
      collection(db, "activity_logs")
    );

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }) as ActivityLog)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50);
  } catch {
    return [];
  }
}

export async function cancelSchedule(
  id: string
): Promise<void> {
  await updateDoc(doc(db, "scheduled_interviews", id), {
    status: "CANCELLED",
    cancelledAt: serverTimestamp(),
  });
}

export async function getActiveSessions(): Promise<InterviewSession[]> {
  try {
    const snap = await getDocs(collection(db, "sessions"));

    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }) as InterviewSession)
      .filter((s) => s.status === "active");
  } catch {
    return [];
  }
}