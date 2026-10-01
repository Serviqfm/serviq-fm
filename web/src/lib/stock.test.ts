import { describe, it, expect } from 'vitest'
import { parseStockError, availableStock, parseReservedError } from './stock'

describe('parseStockError', () => {
  it('reads the item and the numbers out of a raised STOCK_SHORT', () => {
    expect(parseStockError('STOCK_SHORT|A4 paper|7.00|6.00')).toEqual({
      item: 'A4 paper', requested: 7, available: 6,
    })
  })
  it('survives the scaffolding Postgres wraps around the message', () => {
    const msg = 'ERROR:  STOCK_SHORT|LED Bulb 9W|12.00|0.00 CONTEXT: PL/pgSQL function ...'
    expect(parseStockError(msg)).toEqual({ item: 'LED Bulb 9W', requested: 12, available: 0 })
  })
  it('keeps a pipe inside the item name out of the numbers', () => {
    expect(parseStockError('STOCK_SHORT|Filter | 20x25|3.00|1.00')).toEqual({
      item: 'Filter | 20x25', requested: 3, available: 1,
    })
  })
  it('is null for any other error', () => {
    expect(parseStockError('BUDGET_EXCEEDED|1|2|3|4')).toBeNull()
    expect(parseStockError(null)).toBeNull()
  })
})

describe('availableStock', () => {
  it('subtracts what other requisitions are holding', () => {
    expect(availableStock({ stock_quantity: 10, reserved_quantity: 4 })).toBe(6)
  })
  it('never goes negative when stock was adjusted below the reservation', () => {
    expect(availableStock({ stock_quantity: 2, reserved_quantity: 5 })).toBe(0)
  })
  it('treats missing values as zero', () => {
    expect(availableStock({})).toBe(0)
    expect(availableStock({ stock_quantity: '8', reserved_quantity: null })).toBe(8)
  })
})

describe('parseReservedError', () => {
  it('reads the item, the attempt and the held quantity', () => {
    expect(parseReservedError('STOCK_RESERVED|Mop heads|3|4.00')).toEqual({
      item: 'Mop heads', attempted: 3, reserved: 4,
    })
  })
  it('survives the scaffolding Postgres wraps around it', () => {
    expect(parseReservedError('ERROR:  STOCK_RESERVED|A4 paper|1.00|6.00 CONTEXT: ...'))
      .toEqual({ item: 'A4 paper', attempted: 1, reserved: 6 })
  })
  it('is null for a different error', () => {
    expect(parseReservedError('STOCK_SHORT|A4 paper|7.00|6.00')).toBeNull()
    expect(parseReservedError(undefined)).toBeNull()
  })
})
