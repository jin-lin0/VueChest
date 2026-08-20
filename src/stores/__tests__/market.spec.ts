import { describe, expect, it } from 'vitest'
import { compareVersions } from '../market'

describe('compareVersions', () => {
  it('compares numeric segments instead of lexicographic text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0', '10.0')).toBeLessThan(0)
  })

  it('accepts a v prefix and missing zero segments', () => {
    expect(compareVersions('v1.2.0', '1.2')).toBe(0)
  })

  it('orders prereleases below stable releases', () => {
    expect(compareVersions('1.0.0-beta.2', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0)
  })

  it('compares prerelease identifiers numerically', () => {
    expect(compareVersions('1.0.0-beta.11', '1.0.0-beta.2')).toBeGreaterThan(0)
  })
})
