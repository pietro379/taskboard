import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDay, isOverdue, parseDay } from './hooks.js'

describe('tarih yardımcıları', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 14, 15, 30)) // 14 Ekim 2026, öğleden sonra
  })

  afterEach(() => vi.useRealTimers())

  it('parseDay günü yerel saatte çözer (UTC kayması olmaz)', () => {
    const day = parseDay('2026-10-14')
    expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 9, 14])
  })

  it('formatDay günü kısa Türkçe biçimde yazar', () => {
    expect(formatDay('2026-10-20')).toMatch(/20/)
    expect(formatDay('2026-10-20').toLowerCase()).toContain('eki')
  })

  it('geçmiş tarihli açık görev gecikmiş sayılır', () => {
    expect(isOverdue('2026-10-13', 'todo')).toBe(true)
    expect(isOverdue('2026-10-13', 'in_progress')).toBe(true)
  })

  it('bugün veya gelecek tarih gecikmiş sayılmaz', () => {
    expect(isOverdue('2026-10-14', 'todo')).toBe(false)
    expect(isOverdue('2026-10-15', 'todo')).toBe(false)
  })

  it('tamamlanan görev veya tarihsiz görev gecikmiş sayılmaz', () => {
    expect(isOverdue('2026-01-01', 'done')).toBe(false)
    expect(isOverdue(null, 'todo')).toBe(false)
  })
})
