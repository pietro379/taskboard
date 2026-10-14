import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined: henüz kontrol ediliyor, null: giriş yapılmamış
  const [user, setUser] = useState(undefined)

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!tokenStore.get()) {
      setUser(null)
      return
    }
    api
      .get('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => logout())
  }, [logout])

  const authenticate = useCallback(async (path, body) => {
    const data = await api.post(path, body)
    tokenStore.set(data.token)
    setUser(data.user)
  }, [])

  const value = useMemo(
    () => ({
      user,
      logout,
      login: (email, password) => authenticate('/api/auth/login', { email, password }),
      register: (name, email, password) => authenticate('/api/auth/register', { name, email, password }),
    }),
    [user, logout, authenticate],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth yalnızca AuthProvider içinde kullanılabilir')
  return ctx
}
