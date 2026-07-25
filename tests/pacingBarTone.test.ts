import { describe, it, expect } from 'vitest'
import { toneFor } from '../src/ui/charts/PacingBar'

// Locks down both ratio -> tone maps (review fix, Task 13): 'spend' is the
// pre-existing budget-pacing ramp (more filled = worse); 'fill' is the new
// goal/completion ramp (more filled = better) used by Goals.tsx and
// Sachin.tsx's EMI bars.
describe('toneFor — direction: spend (default)', () => {
  it('is good under 85%', () => {
    expect(toneFor(0)).toBe('good')
    expect(toneFor(0.5)).toBe('good')
    expect(toneFor(0.84)).toBe('good')
  })

  it('is warning from 85% up to (not including) 100%', () => {
    expect(toneFor(0.85)).toBe('warning')
    expect(toneFor(0.99)).toBe('warning')
  })

  it('is critical at 100% and beyond', () => {
    expect(toneFor(1)).toBe('critical')
    expect(toneFor(1.5)).toBe('critical')
  })

  it('defaults to spend when direction is omitted', () => {
    expect(toneFor(1)).toBe(toneFor(1, 'spend'))
  })
})

describe('toneFor — direction: fill', () => {
  it('is warning under 50% (early progress, not an alarm)', () => {
    expect(toneFor(0, 'fill')).toBe('warning')
    expect(toneFor(0.49, 'fill')).toBe('warning')
  })

  it('is neutral from 50% up to (not including) 100%', () => {
    expect(toneFor(0.5, 'fill')).toBe('neutral')
    expect(toneFor(0.99, 'fill')).toBe('neutral')
  })

  it('is good at 100% and beyond — never critical', () => {
    expect(toneFor(1, 'fill')).toBe('good')
    expect(toneFor(2, 'fill')).toBe('good')
  })
})
