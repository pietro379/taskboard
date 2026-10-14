import { useCallback, useEffect, useRef, useState } from 'react'

// Bir asenkron yükleyiciyi çalıştırır; durum, hata ve yeniden yükleme işlevi döner.
// Yarış durumlarını önlemek için yalnızca en son isteğin sonucu kullanılır.
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const latest = useRef(0)

  const load = useCallback(() => {
    const id = ++latest.current
    setState((s) => ({ ...s, loading: true }))
    loader().then(
      (data) => id === latest.current && setState({ data, error: null, loading: false }),
      (error) => id === latest.current && setState({ data: null, error, loading: false }),
    )
  }, deps)

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) }
}

export const formatDate = (iso) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })

// 'YYYY-AA-GG' metnini yerel saatte güne çevirir (UTC kaymasını önler).
export function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const formatDay = (day) => parseDay(day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })

export function isOverdue(day, status) {
  if (!day || status === 'done') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return parseDay(day) < today
}
