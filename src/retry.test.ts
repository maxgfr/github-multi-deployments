/// <reference types="@types/jest" />

import {withRetry} from './retry'

describe('retry', () => {
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
