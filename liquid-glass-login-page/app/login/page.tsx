"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Brain, Eye, EyeOff, Mail, Lock, User, ArrowLeft,
  AlertCircle, Loader2, Shield, Zap, TrendingUp, Star
} from "lucide-react"
import {
  signInEmail, signUpEmail, signInGoogle, resetPassword,
  firebaseErrorMessage
} from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"

type Tab = "signin" | "signup" | "forgot"

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

interface InputFieldProps {
  id: string; label: string; type?: string; placeholder: string
  value: string; onChange: (v: string) => void; icon: React.ReactNode
  rightEl?: React.ReactNode; error?: string; autoComplete?: string
}
function InputField({ id, label, type = "text", placeholder, value, onChange, icon, rightEl, error, autoComplete }: InputFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</label>
      <div className={`relative flex items-center rounded-xl border transition-all duration-200 input-glow ${error ? "border-red-400 bg-red-50/50" : "border-white/40 bg-white/20 dark:bg-white/10 focus-within:border-[#4FA3FF]/60"}`}>
        <span className="pl-3.5 text-slate-400 flex-shrink-0">{icon}</span>
        <input id={id} type={type} placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)} autoComplete={autoComplete}
          className="w-full py-3 px-3 bg-transparent text-slate-800 dark:text-white placeholder:text-slate-400 text-sm outline-none" />
        {rightEl && <span className="pr-3.5 flex-shrink-0">{rightEl}</span>}
      </div>
      {error && <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5"/>{error}</p>}
    </div>
  )
}

function SocialButton({ icon, label, onClick, loading }: { icon: React.ReactNode; label: string; onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="ripple flex items-center justify-center gap-2.5 w-full py-3 rounded-xl border border-white/40 bg-white/20 dark:bg-white/10 hover:bg-white/30 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
      {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : icon}
      {label}
    </button>
  )
}

// ── Sign In ───────────────────────────────────────────────────────────────────
function SignInForm({ onSwitch }: { onSwitch: (t: Tab) => void }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<"google" | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalErr, setGlobalErr] = useState("")

  const validate = () => {
    const e: Record<string, string> = {}
    if (!email.includes("@")) e.email = "Enter a valid email address"
    if (password.length < 6)  e.password = "Password must be at least 6 characters"
    setErrors(e); return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) return
    setLoading(true); setGlobalErr("")
    try {
      const u = await signInEmail(email, password)
      // Fetch role from Firestore then redirect correctly
      const { getUserProfile } = await import("@/lib/firebase")
      const prof = await getUserProfile(u.uid)
      router.replace(prof?.role === "manager" ? "/manager" : "/dashboard")
    } catch (err: any) {
      setGlobalErr(firebaseErrorMessage(err))
    } finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setSocialLoading("google"); setGlobalErr("")
    try {
      const u = await signInGoogle()
      const { getUserProfile } = await import("@/lib/firebase")
      const prof = await getUserProfile(u.uid)
      router.replace(prof?.role === "manager" ? "/manager" : "/dashboard")
    }
    catch (err: any) { setGlobalErr(firebaseErrorMessage(err)) }
    finally { setSocialLoading(null) }
  }



  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {globalErr && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0"/>
          <p className="text-sm text-red-600 dark:text-red-400">{globalErr}</p>
        </div>
      )}
      <InputField id="si-email" label="Email Address" type="email" placeholder="you@example.com"
        value={email} onChange={setEmail} icon={<Mail className="w-4 h-4"/>} error={errors.email} autoComplete="email"/>
      <InputField id="si-password" label="Password" type={showPw ? "text" : "password"} placeholder="Enter your password"
        value={password} onChange={setPassword} icon={<Lock className="w-4 h-4"/>} error={errors.password} autoComplete="current-password"
        rightEl={<button type="button" onClick={() => setShowPw(!showPw)} className="text-slate-400 hover:text-[#4FA3FF]" aria-label="toggle">
          {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
        </button>}/>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded accent-[#4FA3FF]"/>
          <span className="text-slate-600 dark:text-slate-300">Remember me</span>
        </label>
        <button type="button" onClick={() => onSwitch("forgot")} className="text-[#4FA3FF] hover:underline font-semibold">Forgot password?</button>
      </div>
      <button type="submit" disabled={loading}
        className="ripple w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] hover:shadow-lg hover:shadow-blue-400/40 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin"/>Signing In…</> : "Sign In to InterviewAI"}
      </button>
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-white/30 dark:bg-white/10"/>
        <span className="text-xs text-slate-500 font-medium">or continue with</span>
        <div className="flex-1 h-px bg-white/30 dark:bg-white/10"/>
      </div>
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Don't have an account?{" "}
        <button type="button" onClick={() => onSwitch("signup")} className="text-[#4FA3FF] font-bold hover:underline">Create one free</button>
      </p>
    </form>
  )
}

// ── Sign Up ───────────────────────────────────────────────────────────────────
function SignUpForm({ onSwitch }: { onSwitch: (t: Tab) => void }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [role, setRole] = useState<"candidate" | "manager">("candidate")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<"google" | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalErr, setGlobalErr] = useState("")

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3
  const strengthLabel = ["","Weak","Fair","Good","Strong"][strength]
  const strengthColor  = ["","bg-red-400","bg-amber-400","bg-blue-400","bg-emerald-500"][strength]

  const validate = () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2)  e.name     = "Enter your full name"
    if (!email.includes("@"))    e.email    = "Enter a valid email address"
    if (password.length < 6)     e.password = "Password must be at least 6 characters"
    if (password !== confirm)    e.confirm  = "Passwords do not match"
    setErrors(e); return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) return
    setLoading(true); setGlobalErr("")
    try {
      await signUpEmail(name, email, password, role)
      // Use replace so the login page isn't in the back-stack after signup
      router.replace(role === "manager" ? "/manager" : "/dashboard")
    } catch (err: any) {
      setGlobalErr(firebaseErrorMessage(err))
    } finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setSocialLoading("google"); setGlobalErr("")
    try { await signInGoogle(); router.replace("/dashboard") }
    catch (err: any) { setGlobalErr(firebaseErrorMessage(err)) }
    finally { setSocialLoading(null) }
  }

  const handleGithub = async () => {
    setSocialLoading("github"); setGlobalErr("")
    try { await signInGithub(); router.replace("/dashboard") }
    catch (err: any) { setGlobalErr(firebaseErrorMessage(err)) }
    finally { setSocialLoading(null) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {globalErr && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0"/>
          <p className="text-sm text-red-600 dark:text-red-400">{globalErr}</p>
        </div>
      )}

      {/* Role selector */}
      <div className="flex rounded-xl overflow-hidden border border-white/30">
        {(["candidate","manager"] as const).map(r => (
          <button key={r} type="button" onClick={() => setRole(r)}
            className={`flex-1 py-2 text-sm font-semibold transition-all capitalize ${role === r ? "bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-white/20"}`}>
            {r === "candidate" ? "🎯 Candidate" : "🏢 Manager"}
          </button>
        ))}
      </div>

      <InputField id="su-name" label="Full Name" placeholder="John Doe" value={name} onChange={setName}
        icon={<User className="w-4 h-4"/>} error={errors.name} autoComplete="name"/>
      <InputField id="su-email" label="Email Address" type="email" placeholder="you@example.com"
        value={email} onChange={setEmail} icon={<Mail className="w-4 h-4"/>} error={errors.email} autoComplete="email"/>
      <div className="space-y-1.5">
        <InputField id="su-password" label="Password" type={showPw ? "text" : "password"} placeholder="Create a strong password"
          value={password} onChange={setPassword} icon={<Lock className="w-4 h-4"/>} error={errors.password} autoComplete="new-password"
          rightEl={<button type="button" onClick={() => setShowPw(!showPw)} className="text-slate-400 hover:text-[#4FA3FF]" aria-label="toggle">
            {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
          </button>}/>
        {password.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <div className="flex gap-1 flex-1">{[1,2,3,4].map(i => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColor : "bg-slate-200 dark:bg-slate-700"}`}/>
            ))}</div>
            <span className={`text-xs font-semibold ${["","text-red-500","text-amber-500","text-blue-500","text-emerald-500"][strength]}`}>{strengthLabel}</span>
          </div>
        )}
      </div>
      <InputField id="su-confirm" label="Confirm Password" type={showPw ? "text" : "password"} placeholder="Repeat your password"
        value={confirm} onChange={setConfirm} icon={<Lock className="w-4 h-4"/>} error={errors.confirm} autoComplete="new-password"/>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" required className="mt-0.5 rounded accent-[#4FA3FF]"/>
        <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          I agree to the <a href="#" className="text-[#4FA3FF] hover:underline font-semibold">Terms of Service</a> and <a href="#" className="text-[#4FA3FF] hover:underline font-semibold">Privacy Policy</a>
        </span>
      </label>

      <button type="submit" disabled={loading}
        className="ripple w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] hover:shadow-lg hover:shadow-blue-400/40 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin"/>Creating Account…</> : "Create Free Account"}
      </button>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-white/30 dark:bg-white/10"/>
        <span className="text-xs text-slate-500 font-medium">or sign up with</span>
        <div className="flex-1 h-px bg-white/30 dark:bg-white/10"/>
      </div>
      <div className="flex justify-center">
        <SocialButton icon={<GoogleIcon/>} label="Continue with Google" onClick={handleGoogle} loading={socialLoading === "google"}/>
      </div>
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{" "}
        <button type="button" onClick={() => onSwitch("signin")} className="text-[#4FA3FF] font-bold hover:underline">Sign in</button>
      </p>
    </form>
  )
}

// ── Forgot Password ───────────────────────────────────────────────────────────
function ForgotForm({ onSwitch }: { onSwitch: (t: Tab) => void }) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!email.includes("@")) { setError("Enter a valid email address"); return }
    setError(""); setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err: any) {
      setError(err.code === "auth/user-not-found" ? "No account found with this email." : "Failed to send reset link. Try again.")
    } finally { setLoading(false) }
  }

  if (sent) return (
    <div className="flex flex-col items-center py-10 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
        <Mail className="w-8 h-8 text-[#4FA3FF]"/>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-white">Check your inbox</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        Reset link sent to <strong className="text-slate-700 dark:text-slate-200">{email}</strong>. Expires in 15 minutes.
      </p>
      <button onClick={() => onSwitch("signin")} className="text-sm text-[#4FA3FF] hover:underline font-semibold flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5"/> Back to Sign In
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center pb-2">
        <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-7 h-7 text-[#4FA3FF]"/>
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white">Reset your password</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enter your registered email to receive a reset link.</p>
      </div>
      <InputField id="fp-email" label="Email Address" type="email" placeholder="you@example.com"
        value={email} onChange={setEmail} icon={<Mail className="w-4 h-4"/>} error={error} autoComplete="email"/>
      <button type="submit" disabled={loading}
        className="ripple w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin"/>Sending…</> : "Send Reset Link"}
      </button>
      <button type="button" onClick={() => onSwitch("signin")}
        className="w-full flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-[#4FA3FF] transition-colors font-medium">
        <ArrowLeft className="w-4 h-4"/> Back to Sign In
      </button>
    </form>
  )
}

// ── Side panel ────────────────────────────────────────────────────────────────
function SidePanel({ tab }: { tab: Tab }) {
  const perks = [
    { icon: Brain, text: "AI-powered adaptive interviews" },
    { icon: Zap, text: "Resume analysis in seconds" },
    { icon: Shield, text: "Real-time integrity monitoring" },
    { icon: TrendingUp, text: "Detailed performance reports" },
    { icon: Star, text: "Trusted by 50,000+ candidates" },
  ]
  return (
    <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-b from-[#0a1628] to-[#1a3a7c] text-white relative overflow-hidden h-full">
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(79,163,255,0.15) 0%, transparent 70%)" }}/>
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full" style={{ background: "radial-gradient(circle, rgba(135,206,235,0.1) 0%, transparent 70%)" }}/>
      <div className="relative z-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4FA3FF] to-[#87CEEB] flex items-center justify-center shadow-lg">
            <Brain className="w-5 h-5 text-white"/>
          </div>
          <span className="text-2xl font-extrabold text-gradient">InterviewAI</span>
        </Link>
        <div className="mt-10 space-y-3">
          <h2 className="text-3xl font-extrabold leading-tight">
            {tab === "signup" ? "Start Your Journey to Your Dream Job" : tab === "forgot" ? "We've Got You Covered" : "Welcome Back, Future Hire"}
          </h2>
          <p className="text-blue-200 text-sm leading-relaxed">
            {tab === "signup" ? "Join thousands of candidates who landed top roles at Google, Microsoft, Amazon and more."
              : tab === "forgot" ? "Reset your password securely and get back to practising in minutes."
              : "Continue where you left off. Your AI interview coach is ready."}
          </p>
        </div>
      </div>
      <div className="relative z-10 space-y-4">
        {perks.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#4FA3FF]/20 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-[#87CEEB]"/>
            </div>
            <span className="text-blue-100 text-sm">{text}</span>
          </div>
        ))}
      </div>
      <div className="relative z-10 glass-dark rounded-2xl p-5">
        <div className="flex gap-0.5 mb-2">{[...Array(5)].map((_,i) => <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400"/>)}</div>
        <p className="text-blue-100 text-xs leading-relaxed italic">"InterviewAI felt like talking to a real Google recruiter. The adaptive questions pushed me beyond my comfort zone."</p>
        <div className="flex items-center gap-2 mt-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center text-white text-xs font-bold">AR</div>
          <div><p className="text-white text-xs font-semibold">Arjun R.</p><p className="text-blue-300 text-xs">SDE-2 @ Google</p></div>
        </div>
      </div>
    </div>
  )
}

function TabBar({ active, onSwitch }: { active: Tab; onSwitch: (t: Tab) => void }) {
  if (active === "forgot") return null
  return (
    <div className="flex rounded-xl overflow-hidden border border-white/30 mb-6">
      {(["signin","signup"] as Tab[]).map(t => (
        <button key={t} type="button" onClick={() => onSwitch(t)}
          className={`flex-1 py-2.5 text-sm font-bold transition-all ${active === t ? "bg-gradient-to-r from-[#4FA3FF] to-[#1a6fd4] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-white/20"}`}>
          {t === "signin" ? "Sign In" : "Create Account"}
        </button>
      ))}
    </div>
  )
}

// ── Inner page ────────────────────────────────────────────────────────────────
function LoginPageInner() {
  const searchParams       = useSearchParams()
  const router             = useRouter()
  const { user, loading, profile }  = useAuth()
  const initialTab: Tab    = searchParams.get("tab") === "signup" ? "signup" : "signin"
  const [tab, setTab]      = useState<Tab>(initialTab)
  const [mounted, setMounted] = useState(false)

  // Check whether Firebase env vars are filled in
  const missingConfig = false // Keys are configured in .env.local

  useEffect(() => setMounted(true), [])

  // Already authenticated → redirect to correct page based on role
  useEffect(() => {
    if (!loading && user) {
      const dest = profile?.role === "manager" ? "/manager" : "/dashboard"
      router.replace(dest)
    }
  }, [user, profile, loading, router])

  // Show spinner while Firebase resolves the initial auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-interview-hero dark:bg-interview-deep">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center shadow-lg">
            <Brain className="w-6 h-6 text-white animate-pulse"/>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading…</p>
        </div>
      </div>
    )
  }

  // Already authed — show nothing while redirect fires
  if (user) return null

  return (
    <div className="min-h-screen flex bg-interview-hero dark:bg-interview-deep">
      <div className="lg:w-[45%] lg:flex-shrink-0"><SidePanel tab={tab}/></div>
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
        <div className="orb orb-1 opacity-60"/><div className="orb orb-2 opacity-50"/><div className="orb orb-3 opacity-40"/>
        <Link href="/" className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-[#4FA3FF] transition-colors font-medium z-10">
          <ArrowLeft className="w-4 h-4"/><span className="hidden sm:inline">Back to Home</span>
        </Link>
        <div className={`relative z-10 w-full max-w-md space-y-4`}>
          {/* ── Firebase config warning banner ── */}
          {missingConfig && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"/>
              <div className="text-sm">
                <p className="font-bold text-amber-800">Firebase not configured</p>
                <p className="text-amber-700 mt-0.5">
                  Open <code className="bg-amber-100 px-1 rounded">.env.local</code> and replace the placeholder values with your real Firebase project credentials from{" "}
                  <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="underline font-semibold">console.firebase.google.com</a>.
                  Sign-up and login will not work until this is done.
                </p>
              </div>
            </div>
          )}
          <div className={`glass-card rounded-3xl p-8 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="flex lg:hidden items-center justify-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center shadow-lg">
              <Brain className="w-5 h-5 text-white"/>
            </div>
            <span className="text-xl font-bold text-gradient">InterviewAI</span>
          </div>
          <div className="mb-6 text-center lg:text-left">
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white">
              {tab === "signin" && "Sign In"}
              {tab === "signup" && "Create Account"}
              {tab === "forgot" && "Reset Password"}
            </h1>
            {tab !== "forgot" && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {tab === "signin" ? "Continue your interview preparation journey" : "Start practising with AI interviews for free"}
              </p>
            )}
          </div>
          <TabBar active={tab} onSwitch={setTab}/>
          {tab === "signin"  && <SignInForm  onSwitch={setTab}/>}
          {tab === "signup"  && <SignUpForm  onSwitch={setTab}/>}
          {tab === "forgot"  && <ForgotForm  onSwitch={setTab}/>}
          </div>{/* glass-card */}
        </div>{/* max-w-md wrapper */}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-interview-hero">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#4FA3FF] to-[#1a6fd4] flex items-center justify-center shadow-lg">
          <Brain className="w-6 h-6 text-white animate-pulse"/>
        </div>
      </div>
    }>
      <LoginPageInner/>
    </Suspense>
  )
}

