import { it, expect } from 'vitest'
import { normLabel, categorize, SEED_CATEGORIES } from '../src/lib/normalize'

it('normalizes case/whitespace', () => expect(normLabel('  EnBW  ')).toBe('enbw'))
it('merges case variants', () => expect(normLabel('Rewe')).toBe(normLabel('rewe')))
it('seed hit', () => expect(categorize(normLabel('Edeka'))).toBe('groceries'))
it('override wins', () => expect(categorize('edeka', { edeka: 'lifestyle' })).toBe('lifestyle'))
it('miss → uncategorized', () => expect(categorize('zzz-unknown')).toBe('uncategorized'))
it('seed covers top labels', () => {
  for (const l of ['rent', 'church', 'petrol', 'salary', 'sachin']) expect(SEED_CATEGORIES[l]).toBeDefined()
})

it('aliases the "Advancia" typo to "advanzia"', () => expect(normLabel('Advancia')).toBe('advanzia'))
it('aliasing is case/whitespace-insensitive', () => expect(normLabel('  ADVANCIA  ')).toBe('advanzia'))
it('leaves the correct spelling untouched', () => expect(normLabel('Advanzia')).toBe('advanzia'))

it('seeds the credit card category for amex, sparkasse, advanzia', () => {
  for (const l of ['amex', 'sparkasse', 'advanzia']) expect(SEED_CATEGORIES[l]).toBe('credit card')
})

it('the Advancia typo categorizes as credit card via the alias', () => {
  expect(categorize(normLabel('Advancia'))).toBe('credit card')
})

it('amazon cc aliases to sparkasse (owner: same card)', () => {
  expect(normLabel('Amazon CC')).toBe('sparkasse')
  expect(categorize(normLabel('Amazon CC'))).toBe('credit card')
})

// Spec 2026-07-27 §2: the month-ledger card-payment rows are labeled
// "<card> CC" — folded onto the canonical card labels so categorize() and
// lib/cardDues.ts see them.
it('"<card> CC" payment labels alias to the canonical card', () => {
  expect(normLabel('Advancia CC')).toBe('advanzia')
  expect(normLabel('Advanzia CC')).toBe('advanzia')
  expect(normLabel('Amex CC')).toBe('amex')
})

it('"<card> CC" payment labels categorize as credit card', () => {
  expect(categorize(normLabel('Advancia CC'))).toBe('credit card')
  expect(categorize(normLabel('Amex CC'))).toBe('credit card')
})
