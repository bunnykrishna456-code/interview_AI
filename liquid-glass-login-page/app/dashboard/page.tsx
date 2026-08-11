"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Brain, FileText, Play, BarChart3, LogOut, User,
  Upload, CheckCircle2, Clock, TrendingUp, Star,
  Loader2, AlertCircle, ChevronRight, Zap, Shield
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { logout, getResume, getUserSessions, type ResumeData, type InterviewSession } from "@/lib/firebase"

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [resume, setResume]     = useState<ResumeData | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // ── Guard: unauthenticated → /login ───────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading, router])

  // ── Guard: manager role → /manager ────────────────────────────────────────
  useEffect(() => {
    if (!loading && profile?.role === "manager") router.replace("/manager")
  }, [profile, loading, router])

  // ── Load user data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    Promise.all([getResume(user.uid), getUserSessions(user.uid)])
      .then(([r, s]) => { setResume(r); setSessions(s) })
      .finally(() => setDataLoading(false))
  }, [user])

  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }

  // Show spinner while Firebase resolves
  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-interview-hero dark:bg-interview-deep">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center shadow-lg">
            <Brain className="w-6 h-6 text-white animate-pulse"/>
          </div>
          <p className="text-sm text-slate-500 font-medium">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  const completedSessions = sessions.filter(s => s.status === "completed")
  const avgScore = completedSessions.length
    ? Math.round(completedSessions.reduce((s, x) => s + (x.report?.totalScore ?? 0), 0) / completedSessions.length)
    : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e8f4ff] via-[#dbeeff] to-[#f0f7ff] dark:from-[#0a1628] dark:to-[#1a3a7c]">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 glass border-b border-white/30 shadow-sm shadow-blue-100/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center shadow">
              <Brain className="w-4 h-4 text-white"/>
            </div>
            <span className="text-lg font-bold text-gradient">InterviewAI</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/40 dark:bg-white/10 border border-white/40">
              <User className="w-4 h-4 text-[#4FA3FF]"/>
              <span className="text-sm font-semibold text-slate-700 dark:text-white">{profile?.name ?? user.displayName ?? "Candidate"}</span>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-all">
              <LogOut className="w-4 h-4"/>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Welcome ──────────────────────────────────────────────────────── */}
        <div className="glass-card rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white">
              Welcome back, <span className="text-gradient">{profile?.name?.split(" ")[0] ?? "there"}</span> 👋
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              {resume ? `Resume uploaded · ${sessions.length} interview${sessions.length !== 1 ? "s" : ""} completed` : "Upload your resume to get personalised questions"}
            </p>
          </div>
          <Link href={sessions.length > 0 ? "/report" : resume ? "/interview/new" : "/resume"}
            className="ripple inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] shadow-lg shadow-blue-300/40 hover:-translate-y-0.5 hover:shadow-xl transition-all">
            <Play className="w-4 h-4 fill-white"/>
            {sessions.length > 0 ? "View Reports" : resume ? "Start Interview" : "Upload Resume"}
          </Link>
        </div>

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Interviews Done",   value: completedSessions.length, icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Average Score",     value: avgScore ? `${avgScore}%` : "—", icon: Star,         color: "text-amber-500"  },
            { label: "Resume Score", value: resume ? "✓ Verified" : "—", icon: FileText, color: "text-[#4FA3FF]" },
            { label: "Active Sessions",   value: sessions.filter(s => s.status === "active").length, icon: Clock, color: "text-purple-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="glass-card rounded-2xl p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5"/>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800 dark:text-white">{value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Resume card ────────────────────────────────────────────────── */}
          <div className="glass-card rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-800 dark:text-white text-lg">Resume Analysis</h2>
              <FileText className="w-5 h-5 text-[#4FA3FF]"/>
            </div>
            {dataLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/> Loading…</div>
            ) : resume ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0"/>
                  <div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Resume Analysis Verified</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">{resume.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {resume.skills.slice(0, 6).map(s => (
                    <span key={s} className="px-2.5 py-1 rounded-lg bg-[#4FA3FF]/10 text-[#1a6fd4] dark:text-[#87CEEB] text-xs font-semibold">{s}</span>
                  ))}
                  {resume.skills.length > 6 && <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500 text-xs">+{resume.skills.length - 6} more</span>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{resume.summary}</p>
              </div>
            ) : (
              <div id="upload" className="border-2 border-dashed border-[#4FA3FF]/30 rounded-2xl p-8 text-center space-y-3">
                <Upload className="w-8 h-8 text-[#4FA3FF] mx-auto"/>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Upload your resume to get started</p>
                <p className="text-xs text-slate-400">PDF or DOCX · AI will extract skills and generate personalised questions</p>
                <Link href="/resume"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] hover:-translate-y-0.5 transition-all">
                  <Upload className="w-4 h-4"/> Upload Resume
                </Link>
              </div>
            )}
          </div>

          {/* ── Recent interviews ──────────────────────────────────────────── */}
          <div className="glass-card rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-800 dark:text-white text-lg">Recent Interviews</h2>
              <BarChart3 className="w-5 h-5 text-[#4FA3FF]"/>
            </div>
            {dataLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/> Loading…</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Brain className="w-10 h-10 text-slate-300 mx-auto"/>
                <p className="text-sm text-slate-500">No interviews yet. Start your first one!</p>
                <Link href={resume ? "/interview/new" : "/resume"}
                  className="inline-flex items-center gap-1.5 text-sm text-[#4FA3FF] font-semibold hover:underline">
                  {resume ? "Start Interview" : "Upload Resume first"} <ChevronRight className="w-4 h-4"/>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.slice(0, 5).map(s => (
                  <Link key={s.id} href={`/report/${s.id}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-white/30 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${s.status === "completed" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`}/>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.role}</p>
                        <p className="text-xs text-slate-400">{s.difficulty} · {s.messages.filter(m => m.role === "agent").length} questions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.report && <span className="text-sm font-bold text-[#4FA3FF]">{s.report.totalScore}%</span>}
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#4FA3FF] transition-colors"/>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { href: "/resume",       icon: Upload,     label: "Analyse Resume",    desc: "Upload & get instant AI analysis",  color: "from-blue-400 to-blue-600"   },
            { href: "/interview/new",icon: Play,       label: "Start Interview",   desc: "Begin a new mock interview session", color: "from-indigo-400 to-blue-500" },
            { href: "/report",       icon: BarChart3,  label: "View Reports",      desc: "See all your past performance",      color: "from-sky-400 to-blue-500"    },
          ].map(({ href, icon: Icon, label, desc, color }) => (
            <Link key={label} href={href}
              className="feature-card glass-card rounded-2xl p-5 flex items-center gap-4 hover:shadow-xl hover:shadow-blue-200/40 hover:-translate-y-1 transition-all">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow`}>
                <Icon className="w-6 h-6 text-white"/>
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-white text-sm">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}
