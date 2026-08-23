---
group: 牛客全量答案
order: 10
---

# 牛客算法题 JavaScript 代码附录

> 对应 NQ-296 中合并列出的算法题。代码统一使用 JavaScript，默认输入满足题意；面试时仍应先确认空输入、重复值、越界和是否允许修改原数组。

## 一、数组、字符串与双指针

### 1. 无重复字符的最长子串（Unicode）

```js
function lengthOfLongestSubstring(text) {
  const chars = Array.from(text)
  const last = new Map()
  let left = 0,
    best = 0
  for (let right = 0; right < chars.length; right++) {
    left = Math.max(left, (last.get(chars[right]) ?? -1) + 1)
    last.set(chars[right], right)
    best = Math.max(best, right - left + 1)
  }
  return best
}
```

时间 O(n)，空间 O(k)。`Array.from` 按 Unicode code point 拆分；若要求按用户可见字素簇，应使用 `Intl.Segmenter`。

### 2. 最长递增子序列

```js
function lengthOfLIS(nums) {
  const tails = []
  for (const value of nums) {
    let left = 0,
      right = tails.length
    while (left < right) {
      const middle = (left + right) >> 1
      if (tails[middle] < value) left = middle + 1
      else right = middle
    }
    tails[left] = value
  }
  return tails.length
}
```

时间 O(n log n)，`tails[i]` 是长度 i+1 的递增子序列可取得的最小结尾。

### 3. 最大子数组和 / 最长连续子数组和

```js
function maxSubArray(nums) {
  if (!nums.length) return 0
  let current = nums[0],
    best = nums[0]
  for (let i = 1; i < nums.length; i++) {
    current = Math.max(nums[i], current + nums[i])
    best = Math.max(best, current)
  }
  return best
}
```

Kadane 算法，时间 O(n)，空间 O(1)。如果题意是“和为目标值的最长连续子数组”，应改用前缀和加首次下标 Map。

### 4. 买卖股票 II

```js
function maxProfit(prices) {
  let profit = 0
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) profit += prices[i] - prices[i - 1]
  }
  return profit
}
```

允许多次交易但不能同时持有多股时，收集每段正向差价即可，O(n)。

### 5. 三数之和 / 改版目标和

```js
function threeSumTarget(nums, target = 0) {
  nums = [...nums].sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < nums.length - 2; i++) {
    if (i && nums[i] === nums[i - 1]) continue
    let left = i + 1,
      right = nums.length - 1
    while (left < right) {
      const sum = nums[i] + nums[left] + nums[right]
      if (sum === target) {
        result.push([nums[i], nums[left], nums[right]])
        while (nums[left] === nums[++left]);
        while (nums[right] === nums[--right]);
      } else if (sum < target) left++
      else right--
    }
  }
  return result
}
```

排序加双指针，时间 O(n²)；“改版”若只是目标值非零，传 target 即可。

### 6. 两数之和（三种解法）

```js
function twoSumBrute(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) return [i, j]
  return []
}

function twoSumHash(nums, target) {
  const seen = new Map()
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i]
    seen.set(nums[i], i)
  }
  return []
}

function twoSumSorted(nums, target) {
  let left = 0,
    right = nums.length - 1
  while (left < right) {
    const sum = nums[left] + nums[right]
    if (sum === target) return [left, right]
    if (sum < target) left++
    else right--
  }
  return []
}
```

暴力 O(n²)；哈希 O(n) 空间 O(n)；已排序数组双指针 O(n) 且空间 O(1)。

### 7. 电话号码的字母组合

```js
function letterCombinations(digits) {
  if (!digits) return []
  const map = ['', '', 'abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz']
  const result = [],
    path = []
  function backtrack(index) {
    if (index === digits.length) return void result.push(path.join(''))
    for (const char of map[Number(digits[index])]) {
      path.push(char)
      backtrack(index + 1)
      path.pop()
    }
  }
  backtrack(0)
  return result
}
```

### 8. 盛水最多的容器

```js
function maxArea(height) {
  let left = 0,
    right = height.length - 1,
    best = 0
  while (left < right) {
    best = Math.max(best, Math.min(height[left], height[right]) * (right - left))
    if (height[left] <= height[right]) left++
    else right--
  }
  return best
}
```

每次移动较短边才可能提高上界，时间 O(n)。

### 9. 除自身以外数组的乘积

```js
function productExceptSelf(nums) {
  const result = new Array(nums.length).fill(1)
  let prefix = 1,
    suffix = 1
  for (let i = 0; i < nums.length; i++) {
    result[i] *= prefix
    prefix *= nums[i]
  }
  for (let i = nums.length - 1; i >= 0; i--) {
    result[i] *= suffix
    suffix *= nums[i]
  }
  return result
}
```

不使用除法，O(n) 时间；不计输出数组时 O(1) 额外空间。

### 10. 多个有序数组求交集

```js
function intersectSortedArrays(arrays) {
  if (!arrays.length) return []
  let result = [...new Set(arrays[0])]
  for (let index = 1; index < arrays.length && result.length; index++) {
    const next = arrays[index]
    const merged = []
    let i = 0,
      j = 0
    while (i < result.length && j < next.length) {
      if (result[i] === next[j]) {
        if (merged.at(-1) !== result[i]) merged.push(result[i])
        i++
        j++
      } else if (result[i] < next[j]) i++
      else j++
    }
    result = merged
  }
  return result
}
```

### 11. 多数元素

```js
function majorityElement(nums) {
  let candidate,
    count = 0
  for (const value of nums) {
    if (count === 0) candidate = value
    count += value === candidate ? 1 : -1
  }
  return candidate
}
```

Boyer–Moore O(n)/O(1)。若题目不保证多数元素存在，需再遍历验证次数大于 n/2。

### 12. 比较版本号

```js
function compareVersion(a, b) {
  const left = a.split('.'),
    right = b.split('.')
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = BigInt(left[i] ?? 0),
      y = BigInt(right[i] ?? 0)
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}
```

使用 BigInt 避免超长版本段溢出；若包含 semver 预发布标识，应按 SemVer 规则另行解析。

### 13. 字符串相似度（编辑距离）

```js
function editDistance(a, b) {
  const x = Array.from(a),
    y = Array.from(b)
  const dp = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    let diagonal = dp[0]
    dp[0] = i
    for (let j = 1; j <= y.length; j++) {
      const old = dp[j]
      dp[j] = x[i - 1] === y[j - 1] ? diagonal : Math.min(diagonal, dp[j], dp[j - 1]) + 1
      diagonal = old
    }
  }
  return dp[y.length]
}
```

时间 O(mn)，空间 O(n)；相似度可归一化为 `1 - distance / maxLength`。

### 14. 搜索高亮：只高亮前 N 个匹配

```js
function highlightFirstN(text, keyword, maxMatches) {
  if (!keyword || maxMatches <= 0) return [{ text, match: false }]
  const lowerText = text.toLocaleLowerCase()
  const lowerKeyword = keyword.toLocaleLowerCase()
  const parts = []
  let cursor = 0,
    count = 0,
    index
  while (count < maxMatches && (index = lowerText.indexOf(lowerKeyword, cursor)) >= 0) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false })
    parts.push({ text: text.slice(index, index + keyword.length), match: true })
    cursor = index + keyword.length
    count++
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false })
  return parts
}
```

渲染时分别创建文本节点和 `<mark>`，不要把未转义内容拼入 innerHTML。

### 15. 根据成绩输出班级名次（可并列）

```js
function rankByClass(students) {
  const groups = Map.groupBy(students, (student) => student.className)
  return [...groups.values()].flatMap((group) => {
    const sorted = [...group].sort((a, b) => b.score - a.score)
    let rank = 0,
      previousScore
    return sorted.map((student, index) => {
      if (student.score !== previousScore) rank = index + 1
      previousScore = student.score
      return { ...student, rank }
    })
  })
}
```

这是竞赛排名：例如 100、100、90 的名次为 1、1、3。兼容旧环境可用普通 Map 手动分组。

## 二、动态规划与回溯

### 16. 打家劫舍 II（环形房屋）

```js
function robCircle(nums) {
  if (nums.length === 1) return nums[0]
  function robRange(start, end) {
    let skip = 0,
      take = 0
    for (let i = start; i < end; i++) [skip, take] = [Math.max(skip, take), skip + nums[i]]
    return Math.max(skip, take)
  }
  return Math.max(robRange(0, nums.length - 1), robRange(1, nums.length))
}
```

首尾不能同时取，因此拆成不含尾和不含首的两次线性 DP，O(n)。

### 17. 爬楼梯 / 跳台阶

```js
function climbStairs(n) {
  if (n <= 1) return 1
  let previous = 1,
    current = 1
  for (let step = 2; step <= n; step++) [previous, current] = [current, previous + current]
  return current
}
```

每次跳 1 或 2 阶时是 Fibonacci 转移；若允许任意步集合，改成完全背包式 DP。

### 18. 硬币找零（最少硬币数）

```js
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity)
  dp[0] = 0
  for (let value = 1; value <= amount; value++) {
    for (const coin of coins)
      if (coin <= value) dp[value] = Math.min(dp[value], dp[value - coin] + 1)
  }
  return Number.isFinite(dp[amount]) ? dp[amount] : -1
}
```

时间 O(amount × coins.length)，空间 O(amount)。

### 19. 复原 IP 地址

```js
function restoreIpAddresses(text) {
  const result = [],
    path = []
  function backtrack(index) {
    if (path.length === 4) {
      if (index === text.length) result.push(path.join('.'))
      return
    }
    const remaining = text.length - index
    const slots = 4 - path.length
    if (remaining < slots || remaining > slots * 3) return
    for (let length = 1; length <= 3 && index + length <= text.length; length++) {
      const part = text.slice(index, index + length)
      if (part.length > 1 && part[0] === '0') break
      if (Number(part) > 255) break
      path.push(part)
      backtrack(index + length)
      path.pop()
    }
  }
  backtrack(0)
  return result
}
```

### 20. 唯一路径数

```js
function uniquePaths(rows, columns) {
  const dp = new Array(columns).fill(1)
  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) dp[column] += dp[column - 1]
  }
  return dp[columns - 1]
}
```

时间 O(mn)，空间 O(n)。结果可能超过 Number 安全整数，超大网格需用 BigInt。

### 21. 三角形最短路径和

```js
function minimumTotal(triangle) {
  const dp = [...triangle.at(-1)]
  for (let row = triangle.length - 2; row >= 0; row--) {
    for (let column = 0; column <= row; column++) {
      dp[column] = triangle[row][column] + Math.min(dp[column], dp[column + 1])
    }
  }
  return dp[0] ?? 0
}
```

自底向上覆盖一维 DP，O(n²) 时间、O(n) 空间。

### 22. 全排列

```js
function permute(nums) {
  const result = [],
    path = [],
    used = new Uint8Array(nums.length)
  function backtrack() {
    if (path.length === nums.length) return void result.push([...path])
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue
      used[i] = 1
      path.push(nums[i])
      backtrack()
      path.pop()
      used[i] = 0
    }
  }
  backtrack()
  return result
}
```

### 23. 全排列 II（输入含重复）

```js
function permuteUnique(nums) {
  nums = [...nums].sort((a, b) => a - b)
  const result = [],
    path = [],
    used = new Uint8Array(nums.length)
  function backtrack() {
    if (path.length === nums.length) return void result.push([...path])
    for (let i = 0; i < nums.length; i++) {
      if (used[i] || (i > 0 && nums[i] === nums[i - 1] && !used[i - 1])) continue
      used[i] = 1
      path.push(nums[i])
      backtrack()
      path.pop()
      used[i] = 0
    }
  }
  backtrack()
  return result
}
```

排序后只允许同层第一个相同值进入，避免重复排列。

### 24. 单词搜索（剪枝）

```js
function exist(board, word) {
  const chars = Array.from(word)
  const boardCount = new Map(),
    wordCount = new Map()
  board.flat().forEach((char) => boardCount.set(char, (boardCount.get(char) ?? 0) + 1))
  chars.forEach((char) => wordCount.set(char, (wordCount.get(char) ?? 0) + 1))
  if ([...wordCount].some(([char, count]) => (boardCount.get(char) ?? 0) < count)) return false
  if ((boardCount.get(chars[0]) ?? 0) > (boardCount.get(chars.at(-1)) ?? 0)) chars.reverse()

  function dfs(row, column, index) {
    if (index === chars.length) return true
    if (board[row]?.[column] !== chars[index]) return false
    const saved = board[row][column]
    board[row][column] = null
    const found =
      dfs(row + 1, column, index + 1) ||
      dfs(row - 1, column, index + 1) ||
      dfs(row, column + 1, index + 1) ||
      dfs(row, column - 1, index + 1)
    board[row][column] = saved
    return found
  }

  for (let row = 0; row < board.length; row++)
    for (let column = 0; column < board[row].length; column++) if (dfs(row, column, 0)) return true
  return false
}
```

先做字符频次剪枝，并从更稀有的首尾字符开始搜索。

### 25. 括号匹配、有序括号与合法子串提取

```js
function isValidParentheses(text) {
  const pairs = { ')': '(', ']': '[', '}': '{' },
    stack = []
  for (const char of text) {
    if ('([{'.includes(char)) stack.push(char)
    else if (char in pairs && stack.pop() !== pairs[char]) return false
  }
  return stack.length === 0
}

function isOrderedSingleType(text) {
  let balance = 0
  for (const char of text) {
    balance += char === '(' ? 1 : char === ')' ? -1 : 0
    if (balance < 0) return false
  }
  return balance === 0
}

function longestValidParentheses(text) {
  const stack = [-1]
  let best = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') stack.push(i)
    else {
      stack.pop()
      if (!stack.length) stack.push(i)
      else best = Math.max(best, i - stack.at(-1))
    }
  }
  return best
}
```

单一括号合法性可 O(1) 空间；多类型括号必须记住嵌套顺序，通常需要栈。

## 三、二分、选择、堆与缓存

### 26. 二分查找

```js
function binarySearch(nums, target) {
  let left = 0,
    right = nums.length - 1
  while (left <= right) {
    const middle = left + ((right - left) >> 1)
    if (nums[middle] === target) return middle
    if (nums[middle] < target) left = middle + 1
    else right = middle - 1
  }
  return -1
}
```

循环不变量是答案若存在始终位于闭区间 `[left, right]`。

### 27. 二维数组查找（行列递增）

```js
function searchMatrix(matrix, target) {
  if (!matrix.length || !matrix[0].length) return false
  let row = 0,
    column = matrix[0].length - 1
  while (row < matrix.length && column >= 0) {
    const value = matrix[row][column]
    if (value === target) return true
    if (value > target) column--
    else row++
  }
  return false
}
```

从右上角开始每步排除一行或一列，O(m+n)。若题意是整张矩阵按一维全局有序，可按下标映射做 O(log mn) 二分。

### 28. Quickselect：第 K 小 / 第 K 大

```js
function quickselect(nums, index) {
  let left = 0,
    right = nums.length - 1
  while (left <= right) {
    const pivotIndex = left + Math.floor(Math.random() * (right - left + 1))
    ;[nums[pivotIndex], nums[right]] = [nums[right], nums[pivotIndex]]
    let store = left
    for (let i = left; i < right; i++) {
      if (nums[i] < nums[right]) {
        ;[nums[store], nums[i]] = [nums[i], nums[store]]
        store++
      }
    }
    ;[nums[store], nums[right]] = [nums[right], nums[store]]
    if (store === index) return nums[store]
    if (store < index) left = store + 1
    else right = store - 1
  }
  throw new RangeError('invalid index')
}

const kthSmallest = (nums, k) => quickselect([...nums], k - 1)
const kthLargest = (nums, k) => quickselect([...nums], nums.length - k)
```

平均 O(n)，最坏 O(n²)；随机 pivot 降低退化概率。

### 29. 最小 K 个数

```js
function smallestK(nums, k) {
  if (k <= 0) return []
  if (k >= nums.length) return [...nums]
  const copy = [...nums]
  quickselect(copy, k - 1)
  return copy.slice(0, k)
}
```

只要求集合而非有序输出时平均 O(n)；若要求有序结果，再对前 K 项排序。

### 30. 优先级队列（二叉堆）

```js
class PriorityQueue {
  constructor(compare = (a, b) => a - b) {
    this.heap = []
    this.compare = compare
  }
  get size() {
    return this.heap.length
  }
  peek() {
    return this.heap[0]
  }
  push(value) {
    const heap = this.heap
    heap.push(value)
    let index = heap.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.compare(heap[index], heap[parent]) >= 0) break
      ;[heap[index], heap[parent]] = [heap[parent], heap[index]]
      index = parent
    }
    return this
  }
  pop() {
    if (!this.heap.length) return undefined
    const root = this.heap[0],
      last = this.heap.pop()
    if (this.heap.length) {
      this.heap[0] = last
      let index = 0
      while (true) {
        let best = index
        const left = index * 2 + 1,
          right = left + 1
        if (left < this.size && this.compare(this.heap[left], this.heap[best]) < 0) best = left
        if (right < this.size && this.compare(this.heap[right], this.heap[best]) < 0) best = right
        if (best === index) break
        ;[this.heap[index], this.heap[best]] = [this.heap[best], this.heap[index]]
        index = best
      }
    }
    return root
  }
}
```

push/pop 为 O(log n)，peek 为 O(1)。

### 31. 前 K 个高频单词

```js
function topKFrequentWords(words, k) {
  const counts = new Map()
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
  const queue = new PriorityQueue((a, b) =>
    a.count === b.count ? b.word.localeCompare(a.word) : a.count - b.count,
  )
  for (const [word, count] of counts) {
    queue.push({ word, count })
    if (queue.size > k) queue.pop()
  }
  const result = []
  while (queue.size) result.push(queue.pop().word)
  return result.reverse()
}
```

用容量 K 的最小堆，O(n log k)。相同频次按字典序升序输出。

### 32. 中位数

```js
function median(nums) {
  if (!nums.length) return undefined
  const middle = nums.length >> 1
  const right = quickselect([...nums], middle)
  if (nums.length % 2) return right
  const left = quickselect([...nums], middle - 1)
  return (left + right) / 2
}
```

静态数组可用 Quickselect；持续数据流应维护最大堆和最小堆，使插入 O(log n)、查询 O(1)。

### 33. LRU 缓存（含 TTL）

```js
class LRUCache {
  constructor(capacity, ttl = Infinity) {
    this.capacity = capacity
    this.ttl = ttl
    this.map = new Map()
  }
  get(key) {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key)
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }
  set(key, value, ttl = this.ttl) {
    this.map.delete(key)
    this.map.set(key, { value, expiresAt: Date.now() + ttl })
    while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value)
  }
  sweepExpired(now = Date.now()) {
    for (const [key, entry] of this.map) if (entry.expiresAt <= now) this.map.delete(key)
  }
}
```

Map 的插入顺序实现 O(1) 平均 get/set。TTL 采用惰性删除并提供批量清理，避免每个键创建一个定时器。

## 四、二叉树

以下节点默认结构为 `{ val, left, right }`。

### 34. 二叉树右视图

```js
function rightSideView(root) {
  if (!root) return []
  const queue = [root],
    result = []
  for (let head = 0; head < queue.length; ) {
    const levelEnd = queue.length
    while (head < levelEnd) {
      const node = queue[head++]
      if (head === levelEnd) result.push(node.val)
      if (node.left) queue.push(node.left)
      if (node.right) queue.push(node.right)
    }
  }
  return result
}
```

### 35. 层序遍历与逆序层序

```js
function levelOrder(root, bottomUp = false) {
  if (!root) return []
  let queue = [root]
  const levels = []
  while (queue.length) {
    const values = [],
      next = []
    for (const node of queue) {
      values.push(node.val)
      if (node.left) next.push(node.left)
      if (node.right) next.push(node.right)
    }
    levels.push(values)
    queue = next
  }
  return bottomUp ? levels.reverse() : levels
}
```

### 36. 对称二叉树

```js
function isSymmetric(root) {
  function mirror(left, right) {
    if (!left || !right) return left === right
    return (
      left.val === right.val && mirror(left.left, right.right) && mirror(left.right, right.left)
    )
  }
  return !root || mirror(root.left, root.right)
}
```

### 37. 二叉树最大深度

```js
function maxDepth(root) {
  return root ? Math.max(maxDepth(root.left), maxDepth(root.right)) + 1 : 0
}
```

递归时间 O(n)、栈 O(h)。退化树很深时改用显式队列，避免调用栈溢出。

### 38. 二叉树最大宽度

```js
function widthOfBinaryTree(root) {
  if (!root) return 0
  let queue = [[root, 0n]],
    best = 0n
  while (queue.length) {
    const base = queue[0][1]
    const next = []
    let last = 0n
    for (const [node, rawIndex] of queue) {
      const index = rawIndex - base
      last = index
      if (node.left) next.push([node.left, index * 2n])
      if (node.right) next.push([node.right, index * 2n + 1n])
    }
    best = best > last + 1n ? best : last + 1n
    queue = next
  }
  return best <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(best) : best
}
```

索引按层归一化并使用 BigInt，避免深树下完全二叉树编号溢出。

### 39. 二叉树路径和（根到叶）

```js
function pathSum(root, target) {
  const result = [],
    path = []
  function dfs(node, remaining) {
    if (!node) return
    path.push(node.val)
    const next = remaining - node.val
    if (!node.left && !node.right && next === 0) result.push([...path])
    else {
      dfs(node.left, next)
      dfs(node.right, next)
    }
    path.pop()
  }
  dfs(root, target)
  return result
}
```

存在负数时不能用“remaining < 0”剪枝；只有全部节点非负才可这样剪。

### 40. 二叉树最大路径和

```js
function maxPathSum(root) {
  let best = -Infinity
  function gain(node) {
    if (!node) return 0
    const left = Math.max(0, gain(node.left))
    const right = Math.max(0, gain(node.right))
    best = Math.max(best, node.val + left + right)
    return node.val + Math.max(left, right)
  }
  gain(root)
  return best
}
```

向父节点只能贡献一条支路，但当前节点可用左右两支更新全局答案。

### 41. 从层序数组创建二叉树并求叶子高度

```js
function buildTree(values) {
  if (!values.length || values[0] == null) return null
  const root = { val: values[0], left: null, right: null }
  const queue = [root]
  let index = 1
  for (let head = 0; head < queue.length && index < values.length; head++) {
    const node = queue[head]
    for (const side of ['left', 'right']) {
      const value = values[index++]
      if (value != null) {
        node[side] = { val: value, left: null, right: null }
        queue.push(node[side])
      }
    }
  }
  return root
}

function leafHeights(root) {
  const result = []
  function dfs(node, height) {
    if (!node) return
    if (!node.left && !node.right) result.push({ value: node.val, height })
    dfs(node.left, height + 1)
    dfs(node.right, height + 1)
  }
  dfs(root, 0)
  return result
}
```

这里把根高度定义为 0；若题目定义层数从 1 开始，初始 height 改为 1。

## 五、排序、链表与其他算法

### 42. 快速排序

```js
function quickSort(nums, left = 0, right = nums.length - 1) {
  if (left >= right) return nums
  const pivotIndex = left + Math.floor(Math.random() * (right - left + 1))
  ;[nums[pivotIndex], nums[right]] = [nums[right], nums[pivotIndex]]
  let store = left
  for (let i = left; i < right; i++) {
    if (nums[i] < nums[right]) {
      ;[nums[store], nums[i]] = [nums[i], nums[store]]
      store++
    }
  }
  ;[nums[store], nums[right]] = [nums[right], nums[store]]
  quickSort(nums, left, store - 1)
  quickSort(nums, store + 1, right)
  return nums
}
```

平均 O(n log n)，最坏 O(n²)，原地但不稳定；随机 pivot 降低已排序输入退化风险。

### 43. 合并 K 个有序链表

```js
function mergeKLists(lists) {
  const heap = new PriorityQueue((a, b) => a.val - b.val)
  for (const node of lists) if (node) heap.push(node)
  const dummy = { next: null }
  let tail = dummy
  while (heap.size) {
    const node = heap.pop()
    if (node.next) heap.push(node.next)
    tail = tail.next = node
  }
  return dummy.next
}
```

共 N 个节点、K 条链表，时间 O(N log K)，堆空间 O(K)。

### 44. 圆圈中最后剩下的数（约瑟夫环）

```js
function lastRemaining(n, step) {
  let survivor = 0
  for (let size = 2; size <= n; size++) survivor = (survivor + step) % size
  return survivor
}
```

返回 0-based 下标，时间 O(n)、空间 O(1)；1-based 结果再加 1。

### 45. 随机相亲配对

```js
function secureRandomIndex(max) {
  const range = 0x100000000
  const limit = range - (range % max)
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value)
  while (value[0] >= limit)
  return value[0] % max
}

function shuffle(items) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function randomPairs(groupA, groupB) {
  const left = shuffle(groupA),
    right = shuffle(groupB)
  const count = Math.min(left.length, right.length)
  return {
    pairs: Array.from({ length: count }, (_, i) => [left[i], right[i]]),
    unmatched: [...left.slice(count), ...right.slice(count)],
  }
}
```

Fisher–Yates 保证排列等概率；产品规则还要明确性别/偏好、黑名单、历史配对去重和人数不等时的处理。

---

## 复习检查

- 能说明算法选择和循环不变量，而不是只背代码。
- 能主动确认输入规模、是否有序、是否允许修改输入、重复值和空输入。
- 写完至少用正常、空值、单元素和极端值各走一遍。
- 能给出时间与空间复杂度，并说明工程代码还需要哪些校验。

## 参考来源

- [牛客网面试经验](https://www.nowcoder.com/discuss)
- [MDN：JavaScript 指南](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide)
