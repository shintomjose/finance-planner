import { it, expect, vi } from 'vitest'
import { SheetsClient, AuthExpiredError, TabNotFoundError } from '../src/api/sheets'

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

it('quotes tab names and requests UNFORMATTED_VALUE', async () => {
  const f = vi.fn().mockImplementation((_u: unknown) => ok({ valueRanges: [{ values: [[1]] }, { values: [] }] }))
  const c = new SheetsClient(() => 'tok', f as any)
  await c.fetchMonthGrids('JAN_22')
  const url = String(f.mock.calls[0][0])
  expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE')
  expect(url).toContain(encodeURIComponent("'JAN_22'!A1:P100"))
})

it('401 → AuthExpiredError', async () => {
  const f = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
  const c = new SheetsClient(() => 'tok', f as any)
  await expect(c.listMonthTabs()).rejects.toBeInstanceOf(AuthExpiredError)
})

it('listMonthTabs filters non-month and dead tabs', async () => {
  const f = vi.fn().mockImplementation(() => ok({ sheets: [{ properties: { title: 'JAN_22' } }, { properties: { title: 'SACHIN' } }, { properties: { title: 'ETC' } }] }))
  const c = new SheetsClient(() => 'tok', f as any)
  expect(await c.listMonthTabs()).toEqual(['JAN_22'])
})

it('fetchMonthGrids: 401 on the values call → AuthExpiredError', async () => {
  const f = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
  const c = new SheetsClient(() => 'tok', f as any)
  await expect(c.fetchMonthGrids('JAN_22')).rejects.toBeInstanceOf(AuthExpiredError)
})

it('fetchMonthGrids: 401 on the formulas call → AuthExpiredError', async () => {
  let call = 0
  const f = vi.fn().mockImplementation(() => {
    call++
    if (call === 1) return ok({ valueRanges: [{ values: [[1]] }] })
    return Promise.resolve(new Response('', { status: 401 }))
  })
  const c = new SheetsClient(() => 'tok', f as any)
  await expect(c.fetchMonthGrids('JAN_22')).rejects.toBeInstanceOf(AuthExpiredError)
})

it('fetchMonthGrids: 400 (unknown tab) → TabNotFoundError', async () => {
  const f = vi.fn().mockResolvedValue(new Response('', { status: 400 }))
  const c = new SheetsClient(() => 'tok', f as any)
  await expect(c.fetchMonthGrids('NOPE')).rejects.toBeInstanceOf(TabNotFoundError)
})

it('fetchMonthGrids: second call requests FORMULA render for B3:B4, G4, G6 and maps keys, skipping empties', async () => {
  const f = vi.fn().mockImplementation((u: any) => {
    const url = String(u)
    if (url.includes('FORMULA')) {
      return ok({ valueRanges: [{ values: [['=A1'], ['=A2']] }, { values: [] }, { values: [['=D3+D5']] }] })
    }
    return ok({ valueRanges: [{ values: [[10, 20]] }] })
  })
  const c = new SheetsClient(() => 'tok', f as any)
  const grids = await c.fetchMonthGrids('JAN_22')
  expect(grids.values).toEqual([[10, 20]])
  expect(grids.formulas).toEqual({ B3: '=A1', B4: '=A2', G6: '=D3+D5' })
  expect(grids.formulas.G4).toBeUndefined()

  const formulaUrl = String(f.mock.calls[1][0])
  expect(formulaUrl).toContain('valueRenderOption=FORMULA')
  expect(formulaUrl).toContain(encodeURIComponent("'JAN_22'!B3:B4"))
  expect(formulaUrl).toContain(encodeURIComponent("'JAN_22'!G4"))
  expect(formulaUrl).toContain(encodeURIComponent("'JAN_22'!G6"))
})

it('fetchMonthGrids: missing values gracefully → empty grid, no crash', async () => {
  const f = vi.fn().mockImplementation(() => ok({ valueRanges: [{}] }))
  const c = new SheetsClient(() => 'tok', f as any)
  const grids = await c.fetchMonthGrids('JAN_22')
  expect(grids.values).toEqual([])
  expect(grids.formulas).toEqual({})
})
