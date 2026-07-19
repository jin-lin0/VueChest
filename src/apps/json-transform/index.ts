import App from './App.vue'

export default {
  component: App,
  route: '/json-transform',
  meta: {
    name: 'JSON 转换',
    icon: '🔧',
    description: '输入 JSON，编写自定义转换代码（支持导入第三方包），一键转换并高亮格式化，规则本地存储',
  },
}
