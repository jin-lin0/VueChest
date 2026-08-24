import { describe, expect, it } from 'vitest'
import {
  addedNetworkPermissions,
  normalizeSha256,
  sha256Hex,
  verifyBundleIntegrity,
} from '../bundle-integrity'

describe('market bundle integrity', () => {
  it('computes and verifies a stable SHA-256 digest', async () => {
    const bytes = new TextEncoder().encode('VueChest market bundle')
    const digest = await sha256Hex(bytes)

    expect(digest).toBe('4c61c388ec064173f3446c5786ec4cb86d5c05793cb9ba7ae6f07c3571ccda65')
    await expect(verifyBundleIntegrity(bytes, digest.toUpperCase())).resolves.toBe(digest)
  })

  it('blocks tampered bundles and invalid server digests', async () => {
    const bytes = new TextEncoder().encode('changed')
    await expect(verifyBundleIntegrity(bytes, '0'.repeat(64))).rejects.toThrow('完整性校验失败')
    await expect(verifyBundleIntegrity(bytes, 'invalid')).rejects.toThrow('校验值无效')
    expect(normalizeSha256('invalid')).toBeNull()
  })

  it('detects only newly requested network domains', () => {
    expect(
      addedNetworkPermissions(
        ['api.example.com'],
        ['API.EXAMPLE.COM', '*.example.com', '*.example.com'],
      ),
    ).toEqual(['*.example.com'])
  })
})
