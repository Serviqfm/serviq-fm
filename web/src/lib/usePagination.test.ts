import { describe, it, expect } from 'vitest'
import { pageWindow } from './usePagination'

describe('pageWindow', () => {
  it('empty result: no rows, single page, no nav', () => {
    expect(pageWindow(0, 0, 50)).toEqual({ pageCount: 1, from: 0, to: 0, hasPrev: false, hasNext: false })
  })

  it('first page of a full multi-page set', () => {
    expect(pageWindow(120, 0, 50)).toEqual({ pageCount: 3, from: 1, to: 50, hasPrev: false, hasNext: true })
  })

  it('middle page', () => {
    expect(pageWindow(120, 1, 50)).toEqual({ pageCount: 3, from: 51, to: 100, hasPrev: true, hasNext: true })
  })

  it('last (partial) page clamps `to` to total', () => {
    expect(pageWindow(120, 2, 50)).toEqual({ pageCount: 3, from: 101, to: 120, hasPrev: true, hasNext: false })
  })

  it('exact multiple: last page is full, no next', () => {
    expect(pageWindow(100, 1, 50)).toEqual({ pageCount: 2, from: 51, to: 100, hasPrev: true, hasNext: false })
  })
})
