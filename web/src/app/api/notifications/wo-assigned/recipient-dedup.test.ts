import { describe, it, expect } from 'vitest'

// Mirrors the two pieces of non-trivial logic wired for 1C-06/1C-07/WO-28:
//  1) the server route de-dupes recipient ids before the org/active lookup, and
//  2) the edit-page client only sends the *newly added* team/worker deltas so a
//     re-save of an unchanged WO does not re-notify anyone.

function dedupe(ids: string[]): string[] {
  return ids.filter((v, i) => v && ids.indexOf(v) === i)
}

// The client-side delta: workers present now but not at load time, assignee excluded.
function newWorkerDelta(saved: string[], original: string[], assignee: string): string[] {
  return saved.filter(uid => uid !== assignee).filter(uid => !original.includes(uid))
}

describe('wo-assigned recipient handling', () => {
  it('dedupes and drops empties', () => {
    expect(dedupe(['a', 'a', '', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('re-saving unchanged workers notifies nobody', () => {
    expect(newWorkerDelta(['w1', 'w2'], ['w1', 'w2'], '')).toEqual([])
  })

  it('only the newly added worker is notified', () => {
    expect(newWorkerDelta(['w1', 'w2', 'w3'], ['w1', 'w2'], '')).toEqual(['w3'])
  })

  it('the assignee is never double-notified as a worker', () => {
    expect(newWorkerDelta(['w1', 'a'], [], 'a')).toEqual(['w1'])
  })
})
