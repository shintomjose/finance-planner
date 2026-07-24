import { describe, it, expect, vi } from 'vitest'
import { loadWithSilentReauth } from '../src/lib/authRetry'

class FakeAuthExpiredError extends Error {}
const isAuthExpired = (err: unknown): boolean => err instanceof FakeAuthExpiredError

describe('loadWithSilentReauth', () => {
  it('returns ok on first-try success without touching silentReauth', async () => {
    const run = vi.fn(async () => 'data')
    const silentReauth = vi.fn(async () => 'token')
    const r = await loadWithSilentReauth(run, silentReauth, isAuthExpired)
    expect(r).toEqual({ status: 'ok', value: 'data' })
    expect(run).toHaveBeenCalledTimes(1)
    expect(silentReauth).not.toHaveBeenCalled()
  })

  it('on AuthExpiredError, attempts one silent reauth then retries run() once — success', async () => {
    const run = vi.fn().mockRejectedValueOnce(new FakeAuthExpiredError()).mockResolvedValueOnce('data')
    const silentReauth = vi.fn(async () => 'new-token')
    const r = await loadWithSilentReauth(run, silentReauth, isAuthExpired)
    expect(r).toEqual({ status: 'ok', value: 'data' })
    expect(run).toHaveBeenCalledTimes(2)
    expect(silentReauth).toHaveBeenCalledTimes(1)
  })

  it('silent reauth returns null (no token) -> unauthenticated, run() not retried', async () => {
    const run = vi.fn().mockRejectedValueOnce(new FakeAuthExpiredError())
    const silentReauth = vi.fn(async () => null)
    const r = await loadWithSilentReauth(run, silentReauth, isAuthExpired)
    expect(r).toEqual({ status: 'unauthenticated' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('silent reauth succeeds but retried run() still throws AuthExpiredError -> unauthenticated, no second silent-reauth attempt (loop guard)', async () => {
    const run = vi.fn().mockRejectedValue(new FakeAuthExpiredError())
    const silentReauth = vi.fn(async () => 'new-token')
    const r = await loadWithSilentReauth(run, silentReauth, isAuthExpired)
    expect(r).toEqual({ status: 'unauthenticated' })
    expect(run).toHaveBeenCalledTimes(2)
    expect(silentReauth).toHaveBeenCalledTimes(1) // never a second attempt
  })

  it('non-auth error propagates without invoking silentReauth', async () => {
    const boom = new Error('network blip')
    const run = vi.fn(async () => {
      throw boom
    })
    const silentReauth = vi.fn(async () => 'token')
    await expect(loadWithSilentReauth(run, silentReauth, isAuthExpired)).rejects.toBe(boom)
    expect(silentReauth).not.toHaveBeenCalled()
  })

  it('non-auth error on the post-reauth retry also propagates', async () => {
    const boom = new Error('parse blew up')
    const run = vi.fn().mockRejectedValueOnce(new FakeAuthExpiredError()).mockRejectedValueOnce(boom)
    const silentReauth = vi.fn(async () => 'new-token')
    await expect(loadWithSilentReauth(run, silentReauth, isAuthExpired)).rejects.toBe(boom)
  })
})
