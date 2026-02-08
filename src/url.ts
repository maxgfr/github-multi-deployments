/**
 * Validates if a string is a properly formatted URL.
 * Supports both HTTP and HTTPS protocols, with optional port, path, query string, and fragment.
 *
 * @param str - The string to validate
 * @returns true if the string is a valid URL, false otherwise
 *
 * @example
 * ```typescript
 * isValidUrl('https://example.com')        // true
 * isValidUrl('http://localhost:3000')      // true
 * isValidUrl('ftp://example.com')          // false
 * isValidUrl('not-a-url')                  // false
 * ```
 */
export function isValidUrl(str: string): boolean {
  try {
    // Use the URL constructor for more robust validation
    const url = new URL(str)
    // Only allow http: and https: protocols
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    // URL constructor throws if the string is not a valid URL
    return false
  }
}
