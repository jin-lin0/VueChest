// @vitest-environment node
import { ESLint } from 'eslint'
import { expect, it } from 'vitest'

it.each(['ts', 'vue'])('导入规则解析 %s 语法，允许注释和具体模块导入', async (extension) => {
  const eslint = new ESLint()
  const wrap = (code: string) =>
    extension === 'vue' ? `<script setup lang="ts">${code}</script>` : code
  const lint = async (code: string) => {
    const [result] = await eslint.lintText(wrap(code), {
      filePath: `src/import-probe.${extension}`,
    })
    return result.messages.filter((message) => message.ruleId === 'no-restricted-imports')
  }
  expect(
    await lint(
      `// import { Modal } from '@/components'\nimport Modal from '@/components/common/Modal.vue'`,
    ),
  ).toEqual([])
  expect(await lint(`import { Modal } from '@/components'`)).toHaveLength(1)
  expect(await lint(`export { debounce } from '@/utils'`)).toHaveLength(1)
})
