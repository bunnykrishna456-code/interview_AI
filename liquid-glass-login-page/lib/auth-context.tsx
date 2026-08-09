"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth"
import { auth, getUserProfile, setSessionCookie, clearSessionCookie, type UserProfile } from "./firebase"

interface AuthState {
  user:    User | null
  profile: UserProfile | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({
  user:    null,
  profile: null,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user:    null,
    profile: null,
    loading: true,
  })

  useEffect(() => {
    // auth may be null during SSR/build — only subscribe in the browser
    if (!auth) {
      setState({ user: null, profile: null, loading: false })
      return
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setSessionCookie(user.uid)
        const profile = await getUserProfile(user.uid)
        setState({ user, profile, loading: false })
      } else {
        clearSessionCookie()
        setState({ user: null, profile: null, loading: false })
      }
    })
    return () => unsub()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

/** Use inside any Client Component to access auth state */
export function useAuth() {
  return useContext(AuthContext)
}
