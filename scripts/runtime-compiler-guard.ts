import type { Plugin } from 'vite'

/** 在生产构建的实际输出模块中检查，避免依赖会被裁剪的开发期错误文案。 */
export function runtimeCompilerGuard(): Plugin {
  return {
    name: 'runtime-compiler-guard',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const compilerModules = new Set<string>()

        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue
          for (const [id, module] of Object.entries(output.modules)) {
            if (module.renderedLength === 0) continue
            const normalized = id.replaceAll('\\', '/')
            if (
              /\/@vue\/compiler-(?:core|dom)\//.test(normalized) ||
              /\/vue\/dist\/vue\.(?:esm-bundler|esm-browser(?:\.prod)?|global(?:\.prod)?|cjs(?:\.prod)?)\.js/.test(
                normalized,
              )
            ) {
              compilerModules.add(normalized.slice(normalized.lastIndexOf('/node_modules/') + 14))
            }
          }
        }

        if (compilerModules.size) {
          this.error(`宿主产物包含 Vue 运行时编译器：${[...compilerModules].join('、')}`)
        }
      },
    },
  }
}
