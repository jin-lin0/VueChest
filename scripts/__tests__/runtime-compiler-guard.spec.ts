import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterEach, expect, it } from 'vitest'
import { runtimeCompilerGuard } from '../runtime-compiler-guard'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function buildVue(file: string, symbol: string) {
  const root = mkdtempSync(join(tmpdir(), 'vue-compiler-guard-'))
  roots.push(root)
  const entry = join(root, 'entry.js')
  writeFileSync(
    join(root, 'lazy.js'),
    `export { ref } from ${JSON.stringify(resolve('node_modules/vue/dist/vue.runtime.esm-bundler.js'))};`,
  )
  writeFileSync(
    entry,
    `import { ${symbol} } from ${JSON.stringify(resolve('node_modules/vue/dist', file))}; globalThis.__testVue = ${symbol}; globalThis.__testLoadVue = () => import('./lazy.js');`,
  )
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [runtimeCompilerGuard()],
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    build: { outDir: join(root, 'dist'), rollupOptions: { input: entry } },
  })
  return join(root, 'dist')
}

it.each(['vue.esm-bundler.js', 'vue.cjs.prod.js'])(
  '生产构建拒绝实际包含运行时编译器的 %s',
  async (file) => {
    await expect(buildVue(file, 'compile')).rejects.toThrow('宿主产物包含 Vue 运行时编译器')
  },
)

it('纯运行时构建通过', async () => {
  await expect(buildVue('vue.runtime.esm-bundler.js', 'ref')).resolves.toBeTruthy()
})
