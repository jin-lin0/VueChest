/**
 * 农历换算 —— 直接复用 `market-apps/shared/lunar.ts`。
 *
 * 这里以前是 `lunar-javascript` 的一层薄包装，而 `lunar-javascript` 是 435KB 的
 * 单文件 UMD（无 `module`/`exports`/`sideEffects`），Rollup 摇不了树：
 * 本应用只用到 4 个换算函数，却把整库（八字、运势、星宿、数九、节气、节日……）
 * 打进了产物，323KB raw / 105.7KB gzip——而 special-days 是默认安装的应用之一。
 *
 * 换算逻辑现在在 shared 里，是零依赖的紧凑年表，并由
 * `scripts/check-lunar-table.mjs` 对 1900-2100 逐日与权威库差分校验。
 * 本文件保留为转发层，与其它市场应用（`expense`/`bookmark` 的 `src/utils.ts`）写法一致。
 */
export * from '../../shared/lunar'
