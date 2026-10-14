import { describe, expect, it } from 'vitest'
import { applyMove, resolveMove } from './Board.jsx'

const task = (id, status, position) => ({ id, status, position, title: id, labelIds: [] })

const board = () => [
  task('a', 'todo', 1),
  task('b', 'todo', 2),
  task('c', 'todo', 3),
  task('d', 'in_progress', 1),
  task('e', 'done', 1),
]

const order = (tasks, status) => tasks.filter((t) => t.status === status).sort((x, y) => x.position - y.position).map((t) => t.id)

describe('resolveMove', () => {
  it('aynı sütunda aşağı sürüklemede hedef görevin sırasını verir', () => {
    expect(resolveMove(board(), 'a', 'c')).toMatchObject({ status: 'todo', index: 2 })
  })

  it('aynı sütunda yukarı sürüklemede hedef görevin sırasını verir', () => {
    expect(resolveMove(board(), 'c', 'a')).toMatchObject({ status: 'todo', index: 0 })
  })

  it('başka sütundaki bir görevin üzerine bırakınca onun önüne ekler', () => {
    expect(resolveMove(board(), 'a', 'd')).toMatchObject({ status: 'in_progress', index: 0 })
  })

  it('sütunun kendisine bırakınca sona ekler (taşınan görev sayılmaz)', () => {
    expect(resolveMove(board(), 'a', 'done')).toMatchObject({ status: 'done', index: 1 })
    expect(resolveMove(board(), 'a', 'todo')).toMatchObject({ status: 'todo', index: 2 })
  })

  it('kendi üzerine veya bilinmeyen hedefe bırakmak işlem yapmaz', () => {
    expect(resolveMove(board(), 'a', 'a')).toBeNull()
    expect(resolveMove(board(), 'a', 'yok')).toBeNull()
    expect(resolveMove(board(), 'yok', 'b')).toBeNull()
  })
})

describe('applyMove', () => {
  it('aynı sütunda yeniden sıralar ve konumları numaralandırır', () => {
    const tasks = board()
    const result = applyMove(tasks, resolveMove(tasks, 'a', 'c'))
    expect(order(result, 'todo')).toEqual(['b', 'c', 'a'])
    expect(result.filter((t) => t.status === 'todo').map((t) => t.position).sort()).toEqual([1, 2, 3])
  })

  it('başka sütuna taşır; kaynak sütundaki görevler korunur', () => {
    const tasks = board()
    const result = applyMove(tasks, resolveMove(tasks, 'b', 'd'))
    expect(order(result, 'in_progress')).toEqual(['b', 'd'])
    expect(order(result, 'todo')).toEqual(['a', 'c'])
    expect(result).toHaveLength(5)
  })

  it('boş bir sütuna taşır', () => {
    const tasks = board().filter((t) => t.id !== 'e')
    const result = applyMove(tasks, resolveMove(tasks, 'a', 'done'))
    expect(order(result, 'done')).toEqual(['a'])
  })

  it('orijinal listeyi değiştirmez', () => {
    const tasks = board()
    const snapshot = JSON.stringify(tasks)
    applyMove(tasks, resolveMove(tasks, 'a', 'c'))
    expect(JSON.stringify(tasks)).toBe(snapshot)
  })
})
