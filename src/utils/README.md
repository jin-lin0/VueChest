# Utils 工具函数

这个文件夹包含了项目中常用的工具函数，按功能分类组织。

## 文件结构

```
utils/
├── index.ts      # 统一导出入口
├── format.ts     # 格式化相关工具函数
├── storage.ts    # 本地存储相关工具函数
├── validate.ts   # 验证相关工具函数
└── README.md     # 使用说明
```

## 使用方法

### 1. 统一导入（推荐）

```typescript
import { formatDate, setStorage, isValidEmail } from '@/utils'
```

### 2. 按需导入

```typescript
import { formatDate } from '@/utils/format'
import { setStorage, getStorage } from '@/utils/storage'
import { isValidEmail, isValidPhone } from '@/utils/validate'
```

## 工具函数列表

### 格式化工具 (format.ts)

- `formatDate(date, format)` - 格式化日期
- `formatNumber(num)` - 格式化数字（添加千分位分隔符）
- `formatFileSize(bytes)` - 格式化文件大小

### 本地存储工具 (storage.ts)

- `setStorage(key, value)` - 设置本地存储
- `getStorage(key, defaultValue)` - 获取本地存储
- `removeStorage(key)` - 删除本地存储
- `clearStorage()` - 清空所有本地存储
- `hasStorage(key)` - 检查是否存在指定键

### 验证工具 (validate.ts)

- `isValidEmail(email)` - 验证邮箱格式
- `isValidPhone(phone)` - 验证手机号格式（中国大陆）
- `isValidIdCard(idCard)` - 验证身份证号格式
- `isValidUrl(url)` - 验证URL格式
- `getPasswordStrength(password)` - 验证密码强度
- `isNumber(value)` - 验证是否为数字
- `isEmpty(value)` - 验证是否为空

## 使用示例

```typescript
// 格式化日期
const formattedDate = formatDate(new Date(), 'YYYY年MM月DD日')

// 本地存储
setStorage('userInfo', { name: '张三', age: 25 })
const userInfo = getStorage('userInfo')

// 验证邮箱
if (isValidEmail('test@example.com')) {
  console.log('邮箱格式正确')
}
```

## 扩展

如需添加新的工具函数，请：

1. 在相应的功能文件中添加函数
2. 在 `index.ts` 中导出新函数
3. 更新此文档说明新函数的使用方法 