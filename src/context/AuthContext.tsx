import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3001'
const TOKEN_KEY = 'job-search-auth-token'

export interface AuthUser {
  id: number
  email: string
  name: string
  avatarUrl: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  loginWithGoogle: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Post-OAuth: token is delivered in the URL *hash* (see backend /auth/google/callback).
  // Still accept legacy ?auth_token= for one transition. Strip both from the address bar immediately.
  useEffect(() => {
    const hashRaw = window.location.hash.replace(/^#/, '')
    const hashParams = hashRaw ? new URLSearchParams(hashRaw) : null
    const searchParams = new URLSearchParams(window.location.search)

    const urlToken = hashParams?.get('auth_token') ?? searchParams.get('auth_token')
    const authError = hashParams?.get('auth_error') ?? searchParams.get('auth_error')

    const stripOAuthFromUrl = () => {
      searchParams.delete('auth_token')
      searchParams.delete('auth_error')
      const qs = searchParams.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    }

    if (urlToken) {
      localStorage.setItem(TOKEN_KEY, urlToken)
      setToken(urlToken)
      stripOAuthFromUrl()
    } else if (authError) {
      console.error('Auth error:', authError)
      clearAuth()
      stripOAuthFromUrl()
    }
  }, [clearAuth])

  // Whenever token changes, fetch the current user
  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      setUser(null)
      return
    }

    setIsLoading(true)
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.user) {
          setUser(data.user as AuthUser)
        } else {
          clearAuth()
        }
      })
      .catch(() => clearAuth())
      .finally(() => setIsLoading(false))
  }, [token, clearAuth])

  const loginWithGoogle = useCallback(() => {
    window.location.href = `${API_BASE}/auth/google`
  }, [])

  const logout = useCallback(() => {
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    clearAuth()
  }, [token, clearAuth])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
