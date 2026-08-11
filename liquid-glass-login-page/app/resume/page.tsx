"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Brain, Upload, FileText, CheckCircle2, AlertCircle,
  Loader2, ArrowLeft, Play, Star, Code2, Briefcase,
  GraduationCap, Award, ChevronRight, X
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { getResume, type ResumeData } from "@/lib/firebase"

export default function ResumePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [resume, setResume]         = useState<ResumeData | null>(null)
  const [dragging, setDragging]     = useState(false)
  const [fileName, setFileName]     = useState("")
  const [uploading, setUploading]   = useState(false)
  const [progress, setProgress]     = useState(0)
  const [error, setError]           = useState("")
  const [dataLoading, setDataLoading] = useState(true)

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading, router])

  // Load existing resume
  useEffect(() => {
    if (!user) return
    getResume(user.uid)
      .then(r => setResume(r))
      .finally(() => setDataLoading(false))
  }, [user])

  // Extract text from file using FileReader
  const extractText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string ?? "")
      reader.onerror = reject
      // For PDF/DOCX we read as text — works for text-based PDFs
      // For real binary PDF parsing, a server-side library would be used
      reader.readAsText(file)
    })

  const handleFile = async (file: File) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!allowed.includes(file.type) && !["pdf","docx","txt"].includes(ext ?? "")) {
      setError("Only PDF, DOCX, or TXT files are supported.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB.")
      return
    }

    setError("")
    setFileName(file.name)
    setUploading(true)
    setProgress(10)

    try {
      // Step 1: extract text
      let text = await extractText(file)
      setProgress(30)

      // For binary PDFs the text might be garbled — use filename + size as fallback hint
      if (!text || text.trim().length < 50) {
        text = `Resume file: ${file.name}\nSize: ${file.size} bytes\nPlease ensure you upload a text-based PDF or a plain text version of your resume for best AI analysis results.`
      }

      setProgress(50)

      // Step 2: send to AI analysis API (server-side — keeps Groq key private)
      const res = await fetch("/api/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, uid: user!.uid }),
      })

      setProgress(80)

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Analysis failed")
      }

      const data = await res.json()

      // Step 3: save to Firestore from the client (has auth token — no permission error)
      const { saveResume } = await import("@/lib/firebase")
      await saveResume(user!.uid, data.resume)

      setProgress(100)
      setResume(data.resume)
    } catch (err: any) {
      setError(err.message ?? "Failed to analyse resume. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-interview-hero">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center shadow-lg">
          <Brain className="w-6 h-6 text-white animate-pulse"/>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e8f4ff] via-[#dbeeff] to-[#f0f7ff] dark:from-[#0a1628] dark:to-[#1a3a7c]">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 glass border-b border-white/30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
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

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white">Resume Analysis</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Upload your resume and our AI will extract your skills and generate personalised interview questions.</p>
        </div>

        {/* Upload zone */}
        {!resume && !uploading && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-200 ${
              dragging ? "border-[#4FA3FF] bg-[#4FA3FF]/10 scale-[1.01]" : "border-[#4FA3FF]/30 bg-white/40 dark:bg-white/5 hover:border-[#4FA3FF]/60 hover:bg-[#4FA3FF]/5"
            }`}
          >
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}/>
            <Upload className="w-14 h-14 text-[#4FA3FF] mx-auto mb-4"/>
            <p className="text-xl font-bold text-slate-700 dark:text-slate-200">Drop your resume here</p>
            <p className="text-slate-400 mt-2 text-sm">or click to browse · PDF, DOCX, TXT · Max 5 MB</p>
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="glass-card rounded-3xl p-8 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-[#4FA3FF] animate-spin"/>
              <div>
                <p className="font-bold text-slate-800 dark:text-white">Analysing {fileName}…</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {progress < 30 ? "Reading file…" : progress < 60 ? "Extracting content…" : progress < 90 ? "AI is analysing your resume…" : "Saving results…"}
                </p>
              </div>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div className="progress-fill h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}/>
            </div>
            <p className="text-xs text-slate-400 text-right">{progress}%</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"/>
            <div>
              <p className="font-semibold text-red-700">Analysis failed</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
              <button onClick={() => { setError(""); setFileName("") }} className="text-xs text-red-500 hover:underline mt-1 flex items-center gap-1">
                <X className="w-3 h-3"/> Try again
              </button>
            </div>
          </div>
        )}

        {/* Resume results */}
        {resume && !uploading && (
          <div className="space-y-6">
            {/* Analysis Completed banner + Score */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-5">
              {/* Top row: badge + name + CTA */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Verified badge */}
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex flex-col items-center justify-center shadow-lg flex-shrink-0">
                    <CheckCircle2 className="w-7 h-7 text-white"/>
                    <span className="text-white text-xs font-bold mt-0.5">Done</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xl font-extrabold text-slate-800 dark:text-white">{resume.name}</p>
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5"/> Analysis Completed
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">{resume.summary}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <Link href="/interview/new" className="ripple inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-white font-bold bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] shadow-lg hover:-translate-y-0.5 transition-all">
                    <Play className="w-4 h-4 fill-white"/> Start Interview
                  </Link>
                  <button onClick={() => { setResume(null); setFileName("") }} className="text-sm text-slate-500 hover:text-[#4FA3FF] transition-colors text-center">
                    Upload different resume
                  </button>
                </div>
              </div>

              {/* Score row */}
              <div className="border-t border-white/30 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Resume Score</span>
                  <span className={`text-2xl font-extrabold ${
                    resume.score >= 75 ? "text-emerald-500"
                    : resume.score >= 55 ? "text-[#4FA3FF]"
                    : resume.score >= 35 ? "text-amber-500"
                    : "text-red-500"
                  }`}>{resume.score}<span className="text-sm text-slate-400 font-normal">/100</span></span>
                </div>
                {/* Score bar */}
                <div className="h-3 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      resume.score >= 75 ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                      : resume.score >= 55 ? "bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4]"
                      : resume.score >= 35 ? "bg-gradient-to-r from-amber-400 to-amber-500"
                      : "bg-gradient-to-r from-red-400 to-red-500"
                    }`}
                    style={{ width: `${resume.score}%` }}
                  />
                </div>
                {/* Score label */}
                <p className={`text-xs font-semibold ${
                  resume.score >= 75 ? "text-emerald-600"
                  : resume.score >= 55 ? "text-[#4FA3FF]"
                  : resume.score >= 35 ? "text-amber-600"
                  : "text-red-500"
                }`}>
                  {resume.score >= 75 ? "🌟 Strong resume — great candidate profile"
                  : resume.score >= 55 ? "✅ Good resume — ready for interviews"
                  : resume.score >= 35 ? "⚠️ Average resume — consider adding more projects and skills"
                  : "📌 Weak resume — add technical projects and skills to improve"}
                </p>
                {/* Score breakdown mini stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  {[
                    { label: "Languages", value: resume.languages.length, icon: "💻", max: 5 },
                    { label: "Skills",    value: resume.skills.length,    icon: "⚡", max: 10 },
                    { label: "Projects",  value: resume.projects.length,  icon: "🚀", max: 5 },
                    { label: "Experience",value: resume.experience.length, icon: "💼", max: 3 },
                  ].map(({ label, value, icon, max }) => (
                    <div key={label} className="p-3 rounded-xl bg-white/40 dark:bg-white/5 border border-white/30 text-center">
                      <p className="text-lg">{icon}</p>
                      <p className="text-xl font-extrabold text-slate-800 dark:text-white">{value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Skills grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: Code2,        title: "Programming Languages", items: resume.languages    },
                { icon: Star,         title: "Skills",                items: resume.skills       },
                { icon: FileText,     title: "Frameworks",            items: resume.frameworks   },
                { icon: Briefcase,    title: "Experience",            items: resume.experience   },
                { icon: GraduationCap,title: "Education",             items: resume.education    },
                { icon: Award,        title: "Achievements",          items: resume.achievements },
              ].map(({ icon: Icon, title, items }) => items.length > 0 && (
                <div key={title} className="glass-card rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[#4FA3FF]"/>
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.slice(0, 6).map(item => (
                      <span key={item} className="px-2.5 py-1 rounded-lg bg-[#4FA3FF]/10 text-[#1a6fd4] dark:text-[#87CEEB] text-xs font-semibold">{item}</span>
                    ))}
                    {items.length > 6 && <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-400 text-xs">+{items.length - 6}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* If no resume yet and not uploading */}
        {!resume && !uploading && !error && dataLoading && (
          <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin"/> Loading…</div>
        )}
      </div>
    </div>
  )
}
