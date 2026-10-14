// Yayında API ayrı bir adreste olabilir; geliştirmede boş bırakılır ve Vite proxy kullanılır.
const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'taskboard.token'

// localStorage her ortamda kullanılamayabilir (gizli pencere vb.), bu yüzden hatalar yutulur.
export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* oturum yalnızca bu sekmede geçerli olur */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* yok say */
    }
  },
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

async function request(method, path, body) {
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.')
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Süresi dolmuş veya geçersiz oturum: kullanıcıyı giriş sayfasına yönlendir
    if (res.status === 401 && token) onUnauthorized()
    throw new ApiError(res.status, data?.error ?? 'Beklenmeyen bir hata oluştu', data?.details)
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  delete: (path) => request('DELETE', path),
}

// Hata nesnesini kullanıcıya gösterilecek tek bir metne çevirir (alan hataları dahil).
export function errorMessage(error) {
  if (!error) return ''
  const fields = error.details?.map((d) => d.message).join(' · ')
  return fields ? `${error.message}: ${fields}` : error.message
}
