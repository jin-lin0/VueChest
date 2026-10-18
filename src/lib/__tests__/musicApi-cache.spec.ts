import { afterEach, describe, expect, it, vi } from 'vitest'

// musicApi 的缓存是**模块级单例**，每个用例都重新加载模块，避免相互污染。
async function loadApi() {
  vi.resetModules()
  return await import('../musicApi')
}

// 数组也要收：上游确实会回 200 + `[]`（见「JSON 响应为空数组」用例），
// 而 JSON.stringify 对数组和对象一视同仁，类型里必须如实写出来。
type Body = string | unknown[] | Record<string, unknown>

function installFetch(pick: (url: string, nth: number) => Body) {
  const calls: string[] = []
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const nth = calls.length
    calls.push(url)
    const body = pick(url, nth)
    const isJson = typeof body !== 'string'
    return new Response(isJson ? JSON.stringify(body) : (body as string), {
      status: 200,
      headers: { 'content-type': isJson ? 'application/json' : 'text/plain' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('musicApi 缓存', () => {
  it('同一请求第二次直接命中缓存，不再打上游', async () => {
    const { musicApi } = await loadApi()
    const calls = installFetch(() => '[00:00.00] 你好')

    expect(await musicApi.lyric('netease', '123')).toBe('[00:00.00] 你好')
    expect(await musicApi.lyric('netease', '123')).toBe('[00:00.00] 你好')
    expect(calls.length).toBe(1)
  })

  it('空响应也必须算命中：上游确实会回 200 + 空体', async () => {
    // 空歌词是有效响应，也应被缓存。
    const { musicApi } = await loadApi()
    const calls = installFetch(() => '')

    expect(await musicApi.lyric('netease', 'no-lyric')).toBe('')
    expect(await musicApi.lyric('netease', 'no-lyric')).toBe('')
    expect(calls.length).toBe(1)
  })

  it('JSON 响应为空数组时同样算命中', async () => {
    const { musicApi } = await loadApi()
    const calls = installFetch(() => [])

    await musicApi.playlistTracks('netease', '999')
    await musicApi.playlistTracks('netease', '999')
    expect(calls.length).toBe(1)
  })

  it('缓存条目有硬上限：超限时淘汰最久未用的', async () => {
    const { musicApi, MAX_CACHE_ENTRIES } = await loadApi()
    const calls = installFetch((url) => ({ url }))

    const total = MAX_CACHE_ENTRIES + 5
    for (let i = 0; i < total; i++) await musicApi.search(`kw-${i}`)
    expect(calls.length).toBe(total)

    const before = calls.length
    // 刚用过的还在
    await musicApi.search(`kw-${total - 1}`)
    expect(calls.length).toBe(before)
    // 最久没用过的已被淘汰，必须重新拉
    await musicApi.search('kw-0')
    expect(calls.length).toBe(before + 1)
  })

  it('命中会刷新使用顺序，淘汰的是最久未用而不是最早写入', async () => {
    const { musicApi, MAX_CACHE_ENTRIES } = await loadApi()
    const calls = installFetch((url) => ({ url }))

    expect(MAX_CACHE_ENTRIES).toBeGreaterThan(0)
    for (let i = 0; i < MAX_CACHE_ENTRIES; i++) await musicApi.search(`k-${i}`)
    // 守卫：填满这一步必须真的发生过，否则下面的断言会空转通过
    expect(calls.length).toBe(MAX_CACHE_ENTRIES)

    // 复用一次 k-0，把它变成「最近使用」
    await musicApi.search('k-0')

    // 再写一条，挤出最久未用的 k-1
    await musicApi.search('k-new')
    const afterNew = calls.length

    await musicApi.search('k-0')
    expect(calls.length, 'k-0 刚被用过，不该被淘汰').toBe(afterNew)
    await musicApi.search('k-1')
    expect(calls.length, 'k-1 才是最久未用的').toBe(afterNew + 1)
  })

  it('超过 TTL 后重新拉取', async () => {
    await loadApi()
    vi.useFakeTimers()
    const { musicApi, CACHE_TTL } = await import('../musicApi')
    const calls = installFetch((url) => ({ url }))

    await musicApi.toplist()
    expect(calls.length).toBe(1)
    await musicApi.toplist()
    expect(calls.length).toBe(1)

    vi.setSystemTime(Date.now() + CACHE_TTL + 1)
    await musicApi.toplist()
    expect(calls.length).toBe(2)
  })

  it('上游报错不写缓存，下次重试', async () => {
    const { musicApi } = await loadApi()
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        return new Response('boom', { status: 500 })
      }),
    )

    await expect(musicApi.toplist()).rejects.toThrow('Music API error: 500')
    await expect(musicApi.toplist()).rejects.toThrow('Music API error: 500')
    expect(calls.length).toBe(2)
  })
})
