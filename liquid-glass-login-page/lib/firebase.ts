import { initializeApp, getApps, getApp } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
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

// ── Firebase config validation ────────────────────────────────────────────────
// Throws a clear error at startup if env vars are missing rather than
// letting Firebase throw a cryptic auth/invalid-api-key later.
const REQUIRED_ENV = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Detect placeholder values that haven't been replaced yet
const MISSING = Object.entries(REQUIRED_ENV)
  .filter(([, v]) => !v || v.includes("PASTE_YOUR") || v.includes("_HERE") || v.includes("your_") || v.includes("_here"))
  .map(([k]) => k)

if (MISSING.length > 0 && typeof window !== "undefined") {
  console.error(
    `[InterviewAI] Firebase is not configured.\n` +
    `Missing or placeholder environment variables:\n${MISSING.join("\n")}\n\n` +
    `Copy .env.local and fill in your Firebase project values from:\n` +
    `https://console.firebase.google.com → Project Settings → Your Apps`
  )
}

const firebaseConfig = {
  apiKey:            REQUIRED_ENV.apiKey            ?? "",
  authDomain:        REQUIRED_ENV.authDomain        ?? "",
  projectId:         REQUIRED_ENV.projectId         ?? "",
  storageBucket:     REQUIRED_ENV.storageBucket     ?? "",
  messagingSenderId: REQUIRED_ENV.messagingSenderId ?? "",
  appId:             REQUIRED_ENV.appId             ?? "",
}

// ── Lazy singleton — only initialise when a key is actually present ───────────
// This prevents the build from crashing when env vars are not available
// during Next.js static pre-rendering of error pages.
function getApp_safe() {
  if (getApps().length) return getApp()
  // If no API key yet (build time), use a placeholder that won't throw
  const cfg = { ...firebaseConfig }
  if (!cfg.apiKey) cfg.apiKey = "placeholder-build-time-key"
  try {
    return initializeApp(cfg)
  } catch {
    return getApps()[0] ?? initializeApp(cfg)
  }
}

const app  = getApp_safe()
const auth = getAuth(app)
const db   = getFirestore(app)

// ── Auth providers ────────────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider()
const githubProvider = new GithubAuthProvider()

// ── Auth helpers ──────────────────────────────────────────────────────────────
export async function signInGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  await ensureUserDoc(result.user)
  setSessionCookie(result.user.uid)
  return result.user
}

export async function signInGithub() {
  const result = await signInWithPopup(auth, githubProvider)
  await ensureUserDoc(result.user)
  setSessionCookie(result.user.uid)
  return result.user
}

export async function signInEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  setSessionCookie(result.user.uid)
  return result.user
}

export async function signUpEmail(name: string, email: string, password: string, role: "candidate" | "manager" = "candidate") {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(result.user, { displayName: name })
  await ensureUserDoc(result.user, role, name)
  setSessionCookie(result.user.uid)
  return result.user
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email)
}

export async function logout() {
  clearSessionCookie()
  await signOut(auth)
}

export { auth, db, onAuthStateChanged }
export type { User, Timestamp }

// ── Firestore helpers ─────────────────────────────────────────────────────────

/** Create user doc if it doesn't exist yet */
async function ensureUserDoc(user: User, role: "candidate" | "manager" = "candidate", name?: string) {
  const ref = doc(db, "users", user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      uid:       user.uid,
      name:      name ?? user.displayName ?? "User",
      email:     user.email,
      role,
      createdAt: serverTimestamp(),
    })
  }
}

/** Get user profile (role etc.) */
export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid))
  return snap.exists() ? (snap.data() as UserProfile) : null
}

/** Save analysed resume data */
export async function saveResume(uid: string, data: ResumeData) {
  await setDoc(doc(db, "resumes", uid), { ...data, updatedAt: serverTimestamp() })
}

/** Get resume for a user */
export async function getResume(uid: string): Promise<ResumeData | null> {
  const snap = await getDoc(doc(db, "resumes", uid))
  return snap.exists() ? (snap.data() as ResumeData) : null
}

/** Create a new interview session, return its id */
export async function createSession(session: Omit<InterviewSession, "id" | "createdAt">) {
  const ref = await addDoc(collection(db, "sessions"), {
    ...session,
    createdAt: serverTimestamp(),
    status: "active",
    messages: [],
  })
  return ref.id
}

/** Get a session */
export async function getSession(id: string): Promise<InterviewSession | null> {
  const snap = await getDoc(doc(db, "sessions", id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as InterviewSession) : null
}

/** Append a message to a session */
export async function appendMessage(sessionId: string, message: ChatMessage) {
  const ref = doc(db, "sessions", sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const messages: ChatMessage[] = snap.data().messages ?? []
  messages.push({ ...message, ts: Date.now() })
  await updateDoc(ref, { messages })
}

/** Update session score and close it */
export async function closeSession(sessionId: string, report: SessionReport) {
  await updateDoc(doc(db, "sessions", sessionId), {
    status:      "completed",
    report,
    completedAt: serverTimestamp(),
  })
}

/** Get all sessions for a user */
export async function getUserSessions(uid: string): Promise<InterviewSession[]> {
  try {
    const q = query(
      collection(db, "sessions"),
      where("candidateId", "==", uid)
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as InterviewSession))
      .sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds ?? 0
        const bTime = (b.createdAt as any)?.seconds ?? 0
        return bTime - aTime
      })
  } catch (err: any) {
    // Index still building or rules issue — return empty so dashboard loads
    console.warn("[getUserSessions] Firestore query failed:", err?.code, err?.message)
    return []
  }
}

/** Manager: get ALL sessions */
export async function getAllSessions(): Promise<InterviewSession[]> {
  try {
    const snap = await getDocs(collection(db, "sessions"))
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as InterviewSession))
      .sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds ?? 0
        const bTime = (b.createdAt as any)?.seconds ?? 0
        return bTime - aTime
      })
  } catch (err: any) {
    console.warn("[getAllSessions] Firestore query failed:", err?.code, err?.message)
    return []
  }
}

/** Manager: get all candidates */
export async function getAllCandidates(): Promise<UserProfile[]> {
  const q = query(collection(db, "users"), where("role", "==", "candidate"))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as UserProfile)
}

// ── Shared types ──────────────────────────────────────────────────────────────
export interface UserProfile {
  uid:       string
  name:      string
  email:     string
  role:      "candidate" | "manager"
  createdAt: Timestamp
}

export interface ResumeData {
  uid:          string
  rawText:      string
  name:         string
  skills:       string[]
  languages:    string[]
  frameworks:   string[]
  experience:   string[]
  projects:     string[]
  education:    string[]
  achievements: string[]
  score:        number   // 0-100
  summary:      string
}

export interface ChatMessage {
  role:    "agent" | "candidate"
  content: string
  score?:  number   // per-answer score 0-10
  feedback?: string
  ts?:     number
}

export interface InterviewSession {
  id:          string
  candidateId: string
  candidateName: string
  role:        string
  difficulty:  string
  status:      "active" | "completed"
  messages:    ChatMessage[]
  report?:     SessionReport
  createdAt:   Timestamp
  completedAt?: Timestamp
}

export interface SessionReport {
  totalScore:       number  // 0-100
  technicalScore:   number
  communicationScore: number
  questionsAsked:   number
  correctAnswers:   number
  strengths:        string[]
  weaknesses:       string[]
  improvements:     ImprovementItem[]
  recommendation:   "Highly Recommended" | "Recommended" | "Needs Improvement" | "Not Ready Yet"
}

export interface ImprovementItem {
  topic:       string
  suggestion:  string
  resources:   string[]
}

// ── Human-readable Firebase error messages ────────────────────────────────────
export function firebaseErrorMessage(err: any): string {
  const code: string = err?.code ?? ""
  const map: Record<string, string> = {
    // Config / setup
    "auth/invalid-api-key":            "Firebase is not configured. Fill in your .env.local values.",
    "auth/app-not-authorized":         "This domain is not authorised in Firebase. Add it in Firebase Console → Authentication → Settings.",
    // Email/password auth
    "auth/email-already-in-use":       "This email is already registered. Please sign in instead.",
    "auth/invalid-email":              "That doesn't look like a valid email address.",
    "auth/user-not-found":             "No account found with this email.",
    "auth/wrong-password":             "Incorrect password.",
    "auth/invalid-credential":         "Incorrect email or password.",
    "auth/weak-password":              "Password is too weak. Use at least 6 characters, a number, and an uppercase letter.",
    "auth/missing-password":           "Please enter a password.",
    "auth/missing-email":              "Please enter your email address.",
    // Rate limiting
    "auth/too-many-requests":          "Too many attempts. Please wait a minute and try again.",
    // Network
    "auth/network-request-failed":     "Network error. Check your internet connection and try again.",
    // Popups (Google / GitHub)
    "auth/popup-closed-by-user":       "Sign-in window was closed. Please try again.",
    "auth/popup-blocked":              "Popup blocked by your browser. Please allow popups for this site.",
    "auth/cancelled-popup-request":    "Sign-in was cancelled.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email using a different sign-in method.",
    // Firestore
    "permission-denied":               "Database permission denied. Check your Firestore security rules.",
  }
  if (map[code]) return map[code]
  // Fallback: surface the raw code so it's debuggable, but don't show technical details
  if (code) return `Authentication error (${code}). Please try again.`
  return err?.message ?? "Something went wrong. Please try again."
}

// ── Session cookie helpers (used by middleware) ───────────────────────────────
// Writes/clears a simple `__session` cookie so the Edge middleware can read it.

export function setSessionCookie(uid: string) {
  if (typeof document === "undefined") return
  // httpOnly cannot be set from JS — this is a basic indicator cookie.
  // For production, replace with a Firebase Admin token exchange endpoint.
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `__session=${uid}; path=/; expires=${expires}; SameSite=Lax`
}

export function clearSessionCookie() {
  if (typeof document === "undefined") return
  document.cookie = "__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax"
}

// ── Scheduled Interviews ──────────────────────────────────────────────────────

export interface ScheduledInterview {
  id:            string
  candidateId:   string
  candidateName: string
  managerId:     string
  managerName:   string
  role:          string
  difficulty:    string
  interviewType: string
  scheduledStart: number   // Unix ms — server-authoritative
  scheduledEnd:   number   // Unix ms
  sessionId?:     string   // set once candidate starts
  status:         "SCHEDULED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED" | "CANCELLED"
  createdAt:      Timestamp
}

export interface MonitoringEvent {
  sessionId:  string
  candidateId: string
  type:       "FULLSCREEN_EXIT" | "TAB_SWITCH" | "WINDOW_BLUR" | "CAMERA_DISABLED" | "MICROPHONE_DISABLED" | "COPY_ATTEMPT" | "PASTE_ATTEMPT"
  ts:         number
  note?:      string
}

/** Manager: create a scheduled interview */
export async function createSchedule(
  data: Omit<ScheduledInterview, "id" | "createdAt" | "status">
): Promise<string> {
  const ref = await addDoc(collection(db, "scheduled_interviews"), {
    ...data,
    status:    "SCHEDULED",
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/** Get a scheduled interview by id */
export async function getSchedule(id: string): Promise<ScheduledInterview | null> {
  const snap = await getDoc(doc(db, "scheduled_interviews", id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ScheduledInterview) : null
}

/** Update schedule status */
export async function updateScheduleStatus(
  id: string,
  status: ScheduledInterview["status"],
  extra?: Record<string, any>
) {
  await updateDoc(doc(db, "scheduled_interviews", id), { status, ...extra })
}

/** Candidate: get their own scheduled interviews */
export async function getUserSchedules(uid: string): Promise<ScheduledInterview[]> {
  try {
    const q = query(
      collection(db, "scheduled_interviews"),
      where("candidateId", "==", uid)
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ScheduledInterview))
      .sort((a, b) => b.scheduledStart - a.scheduledStart)
  } catch (err: any) {
    console.warn("[getUserSchedules]", err?.code, err?.message)
    return []
  }
}

/** Manager: get all scheduled interviews */
export async function getAllSchedules(): Promise<ScheduledInterview[]> {
  try {
    const snap = await getDocs(collection(db, "scheduled_interviews"))
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ScheduledInterview))
      .sort((a, b) => b.scheduledStart - a.scheduledStart)
  } catch (err: any) {
    console.warn("[getAllSchedules]", err?.code, err?.message)
    return []
  }
}

/** Log a monitoring event (tab switch, fullscreen exit, etc.) */
export async function logMonitoringEvent(event: MonitoringEvent): Promise<void> {
  try {
    await addDoc(collection(db, "monitoring_events"), {
      ...event,
      createdAt: serverTimestamp(),
    })
  } catch {
    // Non-fatal — don't crash the interview
  }
}

/** Get all monitoring events for a session */
export async function getMonitoringEvents(sessionId: string): Promise<MonitoringEvent[]> {
  try {
    const q = query(
      collection(db, "monitoring_events"),
      where("sessionId", "==", sessionId)
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => d.data() as MonitoringEvent)
  } catch {
    return []
  }
}

// ── Job Approval ──────────────────────────────────────────────────────────────

export interface JobApproval {
  candidateId:   string
  candidateName: string
  managerId:     string
  status:        "APPROVED" | "REJECTED" | "ON_HOLD" | "PENDING"
  note:          string
  overallScore:  number
  role:          string
  updatedAt:     Timestamp
}

/** Save or update a job approval decision */
export async function saveApproval(approval: Omit<JobApproval, "updatedAt">): Promise<void> {
  await setDoc(doc(db, "approvals", approval.candidateId), {
    ...approval,
    updatedAt: serverTimestamp(),
  })
}

/** Get approval for a candidate */
export async function getApproval(candidateId: string): Promise<JobApproval | null> {
  const snap = await getDoc(doc(db, "approvals", candidateId))
  return snap.exists() ? (snap.data() as JobApproval) : null
}

/** Get all approvals */
export async function getAllApprovals(): Promise<JobApproval[]> {
  try {
    const snap = await getDocs(collection(db, "approvals"))
    return snap.docs.map(d => d.data() as JobApproval)
  } catch { return [] }
}

// ── Activity Log ──────────────────────────────────────────────────────────────

export interface ActivityLog {
  id?:         string
  managerId:   string
  managerName: string
  action:      "CANDIDATE_APPROVED" | "CANDIDATE_REJECTED" | "INTERVIEW_SCHEDULED" |
               "INTERVIEW_RESCHEDULED" | "INTERVIEW_CANCELLED" | "REPORT_VIEWED" |
               "CANDIDATE_ON_HOLD"
  candidateId?:   string
  candidateName?: string
  detail?:        string
  ts:             number
  createdAt?:     Timestamp
}

/** Log a manager action */
export async function logActivity(log: Omit<ActivityLog, "id" | "createdAt">): Promise<void> {
  try {
    await addDoc(collection(db, "activity_logs"), {
      ...log,
      createdAt: serverTimestamp(),
    })
  } catch { /* non-fatal */ }
}

/** Get recent activity logs (last 50) */
export async function getActivityLogs(): Promise<ActivityLog[]> {
  try {
    const snap = await getDocs(collection(db, "activity_logs"))
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ActivityLog))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50)
  } catch { return [] }
}

/** Cancel a scheduled interview */
export async function cancelSchedule(id: string): Promise<void> {
  await updateDoc(doc(db, "scheduled_interviews", id), {
    status: "CANCELLED",
    cancelledAt: serverTimestamp(),
  })
}

/** Get active (IN_PROGRESS) sessions with monitoring events */
export async function getActiveSessions(): Promise<InterviewSession[]> {
  try {
    const snap = await getDocs(collection(db, "sessions"))
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as InterviewSession))
      .filter(s => s.status === "active")
  } catch { return [] }
}
