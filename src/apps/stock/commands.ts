import { STORAGE_KEYS } from '@/config'
import { getStorage } from '@/lib/storage'
import { defineAppCommandProvider, type AppCommandDefinition } from '@/lib/app-command'
import { QUICK_DISCOVER } from './westock-discover'

interface StockReference {
  code: string
  name: string
}

function loadStockReferences(): StockReference[] {
  const sources = [
    getStorage<StockReference[]>(STORAGE_KEYS.STOCK_RECENT, []) || [],
    getStorage<StockReference[]>(STORAGE_KEYS.STOCK_FAVORITES, []) || [],
    getStorage<StockReference[]>(STORAGE_KEYS.STOCK_POSITIONS, []) || [],
  ]
  return [
    ...new Map(
      sources
        .flat()
        .filter((item) => /^\d{6}$/.test(String(item?.code || '')))
        .map((item) => [item.code, { code: item.code, name: item.name || item.code }]),
    ).values(),
  ].slice(0, 12)
}

export function useStockCommandProvider() {
  return defineAppCommandProvider({
    appKey: 'builtin:9',
    appName: '股票研究',
    commands: () => {
      const commands: AppCommandDefinition[] = [
        {
          id: 'stock-discover',
          label: '选股发现',
          description: '按策略、排行、条件、标签、事件筛选候选股票，无需先选定标的',
          icon: '⌕',
          keywords: ['选股', '发现', '策略', '筛选', '排行', '标签', '事件', 'discover'],
          priority: 92,
          execute: ({ router }) => {
            router.push({ path: '/stock', query: { panel: 'westockDiscover' } })
          },
        },
        {
          id: 'stock-open-portfolio',
          label: '查看模拟持仓',
          description: '直接打开仓位、市值与盈亏，不需要先查询股票',
          icon: '◇',
          keywords: ['股票', '持仓', '盈亏', 'portfolio'],
          priority: 88,
          execute: ({ router }) => {
            router.push({ path: '/stock', query: { panel: 'portfolio' } })
          },
        },
      ]

      // 高频选股条件直达：省掉「开面板 → 找分类 → 翻下拉框 → 选条件」四步。
      for (const item of QUICK_DISCOVER) {
        commands.push({
          id: `stock-discover-${item.id}`,
          label: `选股 · ${item.label}`,
          description: item.hint,
          icon: '⌕',
          keywords: ['选股', '发现', '策略', '排行', item.label, item.id],
          priority: 80,
          execute: ({ router }) => {
            router.push({
              path: '/stock',
              query: { panel: 'westockDiscover', preset: item.id, command: String(Date.now()) },
            })
          },
        })
      }

      commands.push(
        ...loadStockReferences().map(
          (stock): AppCommandDefinition => ({
            id: `stock-open-${stock.code}`,
            label: `研究 ${stock.name}`,
            description: `${stock.code} · 打开行情、K线、财务与公告`,
            icon: 'R',
            keywords: ['股票', '行情', '研究', stock.name, stock.code],
            priority: 60,
            execute: ({ router }) => {
              router.push({
                path: '/stock',
                query: { code: stock.code, panel: 'overview', command: String(Date.now()) },
              })
            },
          }),
        ),
      )
      return commands
    },
  })
}
