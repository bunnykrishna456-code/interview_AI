"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Brain, ArrowLeft, Play, Camera, Mic, MicOff,
  VideoOff, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, Briefcase, BarChart3, Clock, Zap, Calendar
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import {
  createSession, getResume, getUserSchedules,
  updateScheduleStatus, type ScheduledInterview
} from "@/lib/firebase"

const ROLES = ["Software Engineer","Frontend Developer","Backend Developer","Full Stack Developer","Data Scientist","Machine Learning Engineer","DevOps Engineer","Product Manager","System Design Engineer","Mobile Developer"]
const TYPES = ["Technical","HR","Behavioral","Coding","System Design","Mixed"]
const LEVELS = ["Fresher (0-1 yr)","Junior (1-3 yrs)","Mid-level (3-5 yrs)","Senior (5-8 yrs)","Lead / Architect (8+ yrs)"]
const DIFFICULTIES = ["Easy","Medium","Hard","Expert"]

// ── Time-window helper ────────────────────────────────────────────────────────
function getScheduleStatus(sc: ScheduledInterview): "before" | "open" | "expired" {
  const now = Date.now()
  if (now < sc.scheduledStart) return "before"
  if (now > sc.scheduledEnd)   return "expired"
  return "open"
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
}

function TimeCountdown({ target, label }: { target: number; label: string }) {
  const [diff, setDiff] = useState(target - Date.now())
  useEffect(() => {
    const t = setInterval(() => setDiff(target - Date.now()), 1000)
    return () => clearInterval(t)
  }, [target])
  if (diff <= 0) return null
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  return (
    <p className="text-xs text-slate-500 mt-1">
      {label}: {h > 0 ? `${h}h ` : ""}{m}m {s}s
    </p>
  )
}

export default function NewInterviewPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [step, setStep]               = useState<"setup"|"permissions"|"ready">("setup")
  const [role, setRole]               = useState(ROLES[0])
  const [type, setType]               = useState("Mixed")
  const [level, setLevel]             = useState(LEVELS[0])
  const [difficulty, setDifficulty]   = useState("Medium")
  const [camOk, setCamOk]             = useState<boolean|null>(null)
  const [micOk, setMicOk]             = useState<boolean|null>(null)
  const [starting, setStarting]       = useState(false)
  const [error, setError]             = useState("")
  const [hasResume, setHasResume]     = useState(false)
  const [schedules, setSchedules]     = useState<ScheduledInterview[]>([])
  const [activeSchedule, setActive]   = useState<ScheduledInterview | null>(null)
  const [schedLoading, setSchedLoad]  = useState(true)
  const [useSchedule, setUseSchedule] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    Promise.all([
      getResume(user.uid).then(r => setHasResume(!!r)),
      getUserSchedules(user.uid).then(sc => {
        setSchedules(sc)
        // pick nearest SCHEDULED/READY interview
        const upcoming = sc.filter(s => s.status === "SCHEDULED" || s.status === "READY" || s.status === "IN_PROGRESS")
        if (upcoming.length > 0) setActive(upcoming[0])
      }),
    ]).finally(() => setSchedLoad(false))
  }, [user])

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  // ── Camera required — request permission ─────────────────────────────────
  const requestPermissions = async () => {
    setStep("permissions")
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream }
      setCamOk(true); setMicOk(true)
      setTimeout(() => setStep("ready"), 800)
    } catch (err: any) {
      // Camera is REQUIRED — do not silently proceed
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Camera and microphone access is required for the interview. Please allow camera permission in your browser address bar, then try again.")
        setCamOk(false); setMicOk(false)
        setStep("setup")   // go back — do NOT proceed without camera
      } else {
        // Try audio only as graceful fallback
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamRef.current = audioStream
          setMicOk(true); setCamOk(false)
          setStep("ready")
        } catch {
          setCamOk(false); setMicOk(false)
          setStep("ready")
        }
      }
    }
  }

  // ── Start interview with schedule time-window validation ─────────────────
  const startInterview = async () => {
    if (!user) return

    // If candidate has a scheduled interview, enforce time window
    if (useSchedule && activeSchedule) {
      const status = getScheduleStatus(activeSchedule)
      if (status === "before") {
        setError(`Your interview is not open yet. It starts at ${fmtTime(activeSchedule.scheduledStart)}.`)
        return
      }
      if (status === "expired") {
        setError("Your interview time window has expired. Please contact your manager.")
        await updateScheduleStatus(activeSchedule.id, "EXPIRED")
        return
      }
    }

    setStarting(true); setError("")
    try {
      const candidateName = profile?.name ?? user.displayName ?? user.email?.split("@")[0] ?? "Candidate"
      const sessionRole       = useSchedule && activeSchedule ? activeSchedule.role       : role
      const sessionDifficulty = useSchedule && activeSchedule ? activeSchedule.difficulty : difficulty

      const sessionId = await createSession({
        candidateId:   user.uid,
        candidateName,
        role:          sessionRole,
        difficulty:    sessionDifficulty,
        status:        "active",
        messages:      [],
      })

      // Mark schedule as IN_PROGRESS
      if (useSchedule && activeSchedule) {
        await updateScheduleStatus(activeSchedule.id, "IN_PROGRESS", { sessionId })
      }

      streamRef.current?.getTracks().forEach(t => t.stop())
      // Request fullscreen from within the user click handler — browser allows this
      try { await document.documentElement.requestFullscreen() } catch { /* browser may deny */ }
      router.push(`/interview/${sessionId}`)
    } catch (err: any) {
      if (err?.code === "permission-denied" || err?.message?.includes("Missing or insufficient permissions")) {
        setError("Firestore permission denied. Please publish security rules in Firebase Console.")
      } else {
        setError(err?.message ?? "Failed to start interview. Please try again.")
      }
      setStarting(false)
    }
  }

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-interview-hero">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center shadow-lg">
        <Brain className="w-6 h-6 text-white animate-pulse"/>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e8f4ff] via-[#dbeeff] to-[#f0f7ff] dark:from-[#0a1628] dark:to-[#1a3a7c]">
      <nav className="sticky top-0 z-50 glass border-b border-white/30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-[#4FA3FF] transition-colors">
            <ArrowLeft className="w-4 h-4"/> Dashboard
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center">
              <Brain className="w-4 h-4 text-white"/>
            </div>
            <span className="font-bold text-gradient">InterviewAI</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-10">
          {(["setup","permissions","ready"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step === s || i < ["setup","permissions","ready"].indexOf(step)
                  ? "bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] text-white shadow"
                  : "bg-white/50 dark:bg-white/10 text-slate-400"}`}>
                {i < ["setup","permissions","ready"].indexOf(step) ? <CheckCircle2 className="w-4 h-4"/> : i + 1}
              </div>
              <span className={`text-sm font-semibold capitalize hidden sm:inline ${step === s ? "text-[#4FA3FF]" : "text-slate-400"}`}>
                {s === "setup" ? "Interview Setup" : s === "permissions" ? "Camera & Mic" : "Ready"}
              </span>
              {i < 2 && <ChevronRight className="w-4 h-4 text-slate-300 mx-1"/>}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Setup ── */}
        {step === "setup" && (
          <div className="space-y-5">

            {/* Scheduled interview rounds — STRICT time window */}
            {!schedLoading && schedules.length > 0 && (
              <div className="glass-card rounded-2xl p-5 space-y-4">
                <h2 className="font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#4FA3FF]"/> Your Scheduled Interview Rounds
                </h2>
                <p className="text-xs text-slate-500">You can only start each round during its assigned time window. The Start button unlocks automatically.</p>
                <div className="space-y-3">
                  {schedules
                    .filter(s => s.status !== "EXPIRED" && s.status !== "CANCELLED" && s.status !== "COMPLETED")
                    .sort((a,b) => a.scheduledStart - b.scheduledStart)
                    .map(sc => {
                      const st = getScheduleStatus(sc)
                      return (
                        <div key={sc.id} className={`p-4 rounded-xl border space-y-2 ${
                          st === "open"   ? "bg-emerald-50 border-emerald-300"
                          : st === "before" ? "bg-slate-50 border-slate-200"
                          : "bg-red-50 border-red-200 opacity-60"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800 text-sm">
                                {(sc as any).roundLabel ?? sc.interviewType}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {fmtTime(sc.scheduledStart)} → {new Date(sc.scheduledEnd).toLocaleTimeString("en-IN",{timeStyle:"short"})}
                              </p>
                              {st === "before" && <TimeCountdown target={sc.scheduledStart} label="Opens in"/>}
                              {st === "open"   && <TimeCountdown target={sc.scheduledEnd}   label="Closes in"/>}
                            </div>
                            <button
                              disabled={st !== "open" || starting}
                              onClick={() => { setActive(sc); setUseSchedule(true) }}
                              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                st === "open"
                                  ? "bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] text-white shadow hover:-translate-y-0.5"
                                  : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
                              {st === "before" ? "🔒 Not Open" : st === "expired" ? "❌ Expired" : activeSchedule?.id === sc.id ? "✓ Selected" : "Select"}
                            </button>
                          </div>
                        </div>
                      )
                    })
                  }
                </div>
                {activeSchedule && getScheduleStatus(activeSchedule) === "open" && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4"/> {(activeSchedule as any).roundLabel ?? activeSchedule.interviewType} is open — click "Next" to begin
                  </div>
                )}
              </div>
            )}

            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white">Interview Setup</h1>

              {!hasResume && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-sm text-amber-700">No resume uploaded. <Link href="/resume" className="font-bold underline">Upload your resume</Link> for personalised questions.</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
                </div>
              )}

              {/* Job Role */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#4FA3FF]"/>Job Role
                </label>
                <select value={role} onChange={e => setRole(e.target.value)} disabled={useSchedule}
                  className="w-full py-3 px-4 rounded-xl border border-white/40 bg-white/60 dark:bg-white/10 text-slate-800 dark:text-white text-sm font-medium outline-none focus:border-[#4FA3FF]/60 disabled:opacity-50 transition-all">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Interview Type */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#4FA3FF]"/>Interview Type
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setType(t)} disabled={useSchedule}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${type === t ? "bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] text-white shadow" : "bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-white/80"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience Level */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#4FA3FF]"/>Experience Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LEVELS.map(l => (
                    <button key={l} type="button" onClick={() => setLevel(l)}
                      className={`py-2.5 px-4 rounded-xl text-sm font-semibold text-left transition-all ${level === l ? "bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] text-white shadow" : "bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-white/80"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#4FA3FF]"/>Difficulty
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DIFFICULTIES.map(d => (
                    <button key={d} type="button" onClick={() => setDifficulty(d)} disabled={useSchedule}
                      className={`py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${difficulty === d ? "bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] text-white shadow" : "bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate3-00 hover:bg-white/80"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Required notice */}
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200">
                <Camera className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-bold text-blue-700">Camera Required</p>
                  <p className="text-xs text-blue-600 mt-0.5">Your camera must remain active throughout the interview for integrity monitoring. Please allow camera access on the next step.</p>
                </div>
              </div>

              <button onClick={requestPermissions}
                disabled={schedules.length > 0 && (!activeSchedule || getScheduleStatus(activeSchedule) !== "open")}
                className="ripple w-full py-4 rounded-2xl font-extrabold text-white bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] shadow-xl hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-lg">
                {schedules.length > 0 && (!activeSchedule || getScheduleStatus(activeSchedule) !== "open")
                  ? "🔒 Select an Open Round to Continue"
                  : <><span>Next — Enable Camera & Mic</span><ChevronRight className="w-5 h-5"/></>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Requesting permissions ── */}
        {step === "permissions" && (
          <div className="glass-card rounded-3xl p-10 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center mx-auto shadow-lg">
              <Camera className="w-8 h-8 text-white animate-pulse"/>
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Enabling Camera & Microphone</h2>
            <p className="text-slate-500 text-sm">Please click <strong>Allow</strong> in your browser's permission popup.</p>
            <Loader2 className="w-6 h-6 text-[#4FA3FF] animate-spin mx-auto"/>
          </div>
        )}

        {/* ── STEP 3: Ready ── */}
        {step === "ready" && (
          <div className="space-y-5">
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white">
                {camOk ? "✅ Camera Active — Ready to Begin" : "⚠ Camera Not Available"}
              </h2>

              {/* Camera preview */}
              <div className="aspect-video bg-slate-900 rounded-2xl overflow-hidden relative">
                {camOk ? (
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"/>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <VideoOff className="w-10 h-10 text-slate-500"/>
                    <p className="text-slate-400 text-sm text-center px-4">Camera not available. You can still proceed but the interview will be monitored without video.</p>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex gap-2">
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${camOk ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300"}`}>
                    <Camera className="w-3 h-3"/> {camOk ? "Camera On" : "No Camera"}
                  </span>
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${micOk ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300"}`}>
                    {micOk ? <Mic className="w-3 h-3"/> : <MicOff className="w-3 h-3"/>} {micOk ? "Mic On" : "No Mic"}
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Role",       useSchedule && activeSchedule ? activeSchedule.role       : role],
                  ["Type",       useSchedule && activeSchedule ? activeSchedule.interviewType : type],
                  ["Level",      level.split(" ")[0]],
                  ["Difficulty", useSchedule && activeSchedule ? activeSchedule.difficulty  : difficulty],
                ].map(([label, val]) => (
                  <div key={label} className="p-3 rounded-xl bg-white/40 dark:bg-white/5 text-center">
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="font-bold text-slate-700 dark:text-slate-200 text-sm mt-0.5 truncate">{val}</p>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setStep("setup"); setError("") }}
                  className="px-5 py-3 rounded-2xl font-semibold text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-white/10 hover:bg-white/80 transition-all">
                  Back
                </button>
                <button onClick={startInterview} disabled={starting}
                  className="ripple flex-1 py-4 rounded-2xl font-extrabold text-white bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] shadow-xl hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-60 transition-all flex items-center justify-center gap-2 text-lg">
                  {starting ? <><Loader2 className="w-5 h-5 animate-spin"/>Starting…</> : <><Play className="w-5 h-5 fill-white"/>Start Interview</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
