/// <reference types="@types/jest" />

import {isRetryableError, withRetry} from './retry'

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), {status})
}

describe('retry', () => {
  describe('isRetryableError', () => {
    it('should retry 429 rate limit errors', () => {
      expect(isRetryableError(httpError('rate limited', 429))).toBe(true)
    })

    it('should retry 5xx server errors', () => {
      expect(isRetryableError(httpError('server error', 500))).toBe(true)
      expect(isRetryableError(httpError('bad gateway', 502))).toBe(true)
      expect(isRetryableError(httpError('unavailable', 503))).toBe(true)
    })

    it('should not retry 4xx client errors', () => {
      expect(isRetryableError(httpError('unauthorized', 401))).toBe(false)
      expect(isRetryableError(httpError('forbidden', 403))).toBe(false)
      expect(isRetryableError(httpError('not found', 404))).toBe(false)
      expect(isRetryableError(httpError('unprocessable', 422))).toBe(false)
    })

    it('should retry errors without an HTTP status', () => {
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true)
      expect(isRetryableError('string error')).toBe(true)
      expect(
        isRetryableError(Object.assign(new Error('x'), {status: 'n/a'}))
      ).toBe(true)
    })
  })

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success')
      const result = await withRetry(fn, {baseDelayMs: 0})
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success')

      const result = await withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 0,
        maxDelayMs: 0
      })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should retry multiple times before succeeding', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValueOnce('success')

      const result = await withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 0,
        maxDelayMs: 0
      })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw after max retries exceeded', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'))

      await expect(
        withRetry(fn, {maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0})
      ).rejects.toThrow('persistent failure')
      // initial attempt + 2 retries = 3 calls
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should convert non-Error to Error', async () => {
      const fn = jest.fn().mockRejectedValue('string error')

      await expect(
        withRetry(fn, {maxRetries: 0, baseDelayMs: 0})
      ).rejects.toThrow('string error')
    })

    it('should use default options when none provided', async () => {
      const fn = jest.fn().mockResolvedValue('success')
      const result = await withRetry(fn)
      expect(result).toBe('success')
    })

    it('should respect maxRetries of 0 (no retries)', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'))

      await expect(
        withRetry(fn, {maxRetries: 0, baseDelayMs: 0})
      ).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should not retry non-retryable HTTP errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('unprocessable'), {status: 422})
        )

      await expect(
        withRetry(fn, {maxRetries: 3, baseDelayMs: 0, maxDelayMs: 0})
      ).rejects.toThrow('unprocessable')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should not retry 404 errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('not found'), {status: 404}))

      await expect(
        withRetry(fn, {maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0})
      ).rejects.toThrow('not found')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry 429 errors until success', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('rate limited'), {status: 429})
        )
        .mockResolvedValueOnce('success')

      const result = await withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 0,
        maxDelayMs: 0
      })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should retry 5xx errors until success', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('server error'), {status: 503})
        )
        .mockResolvedValueOnce('success')

      const result = await withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 0,
        maxDelayMs: 0
      })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should honor a custom isRetryable predicate', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('never retry me'))

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          isRetryable: () => false
        })
      ).rejects.toThrow('never retry me')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should cap delay at maxDelayMs', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok')

      const start = Date.now()
      await withRetry(fn, {
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 1
      })
      const elapsed = Date.now() - start
      // Should not take more than 100ms for a 1ms delay
      expect(elapsed).toBeLessThan(100)
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
