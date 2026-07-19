export interface ApiParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  defaultValue: string
  required: boolean
  description: string
}

export interface ApiItem {
  id: number
  name: string
  url: string
  method: 'GET' | 'POST'
  category: string
  description: string
  params: ApiParam[]
  createdAt: string
}

export const defaultApis: ApiItem[] = [
  {
    id: 1,
    name: '随机笑话',
    url: 'https://official-joke-api.appspot.com/random_joke',
    method: 'GET',
    category: '娱乐',
    description: '获取一个随机的英文笑话',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: '随机猫咪图片',
    url: 'https://api.thecatapi.com/v1/images/search',
    method: 'GET',
    category: '图片',
    description: '获取一张随机的猫咪图片',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: '随机狗狗图片',
    url: 'https://dog.ceo/api/breeds/image/random',
    method: 'GET',
    category: '图片',
    description: '获取一张随机的狗狗图片',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 4,
    name: '获取用户信息',
    url: 'https://jsonplaceholder.typicode.com/users/1',
    method: 'GET',
    category: '测试',
    description: '获取JSONPlaceholder的用户信息（测试用）',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 5,
    name: '随机名言',
    url: 'https://api.quotable.io/random',
    method: 'GET',
    category: '娱乐',
    description: '获取一条随机的名人名言',
    params: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 6,
    name: 'GitHub用户信息',
    url: 'https://api.github.com/users/{username}',
    method: 'GET',
    category: '开发',
    description: '通过用户名获取GitHub用户信息',
    params: [
      {
        name: 'username',
        type: 'string',
        defaultValue: 'octocat',
        required: true,
        description: 'GitHub用户名',
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 7,
    name: '天气查询',
    url: 'https://wttr.in/{city}?format=j1',
    method: 'GET',
    category: '工具',
    description: '查询指定城市的天气信息',
    params: [
      {
        name: 'city',
        type: 'string',
        defaultValue: 'Beijing',
        required: true,
        description: '城市名称（英文）',
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 8,
    name: 'IP地址查询',
    url: 'https://ipapi.co/{ip}/json/',
    method: 'GET',
    category: '工具',
    description: '查询IP地址的地理位置信息',
    params: [
      {
        name: 'ip',
        type: 'string',
        defaultValue: '',
        required: true,
        description: 'IP地址（留空则查询当前IP）',
      },
    ],
    createdAt: new Date().toISOString(),
  },
]
