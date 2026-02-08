/// <reference types="@types/jest" />

import {isValidUrl} from './url'

describe('url', () => {
  describe('isValidUrl', () => {
    it('should return true for valid HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
      expect(isValidUrl('https://example.com/path')).toBe(true)
      expect(isValidUrl('https://example.com:8080')).toBe(true)
      expect(isValidUrl('https://example.com/path?query=value')).toBe(true)
      expect(isValidUrl('https://example.com/path#fragment')).toBe(true)
    })

    it('should return true for valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true)
      expect(isValidUrl('http://localhost:3000')).toBe(true)
      expect(isValidUrl('http://127.0.0.1:8080')).toBe(true)
    })

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false)
      expect(isValidUrl('not-a-url')).toBe(false)
      expect(isValidUrl('')).toBe(false)
      expect(isValidUrl('example.com')).toBe(false)
      expect(isValidUrl('//example.com')).toBe(false)
    })

    it('should return false for other protocols', () => {
      expect(isValidUrl('mailto:test@example.com')).toBe(false)
      expect(isValidUrl('file:///path/to/file')).toBe(false)
      expect(isValidUrl('javascript:void(0)')).toBe(false)
    })
  })
})
