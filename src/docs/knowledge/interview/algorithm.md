---
group: 题源与刷题
order: 3
---

# 算法面试章节

## 概览与准备建议

- **题型结构相对稳定、可以按模式训练**：数组/字符串、双指针、哈希表、链表、二叉树、图与 DP 是常见主线，但公司、岗位和轮次差异很大，不把题单命中率包装成统计事实。
- **前端更重"基础 + 手写实现 + 边界处理"**：链表反转、LRU、深拷贝、二叉树遍历、滑动窗口、接雨水这类既能考代码功底又贴合业务（缓存、虚拟列表）的题最常见。
- **加分项 = "讲清楚"**：先口述暴力解再优化，主动分析时间/空间复杂度与边界（空数组、单元素、重复值、溢出），能给出两种解法（递归/迭代、双指针/单调栈）是高区分度信号。
- **建议准备顺序**：哈希表 + 双指针 + 滑动窗口 → 链表 + 二叉树遍历 → 堆/TopK + 二分 → DP 经典母题 → 回溯 + 并查集 + 单调栈 + 排序手写。

**优先级速查**

- **第一梯队（几乎必会，手写到熟练）**：两数之和、反转链表、无重复字符的最长子串、三数之和、二叉树遍历、LRU 缓存、有效的括号、接雨水、合并 K 个链表、课程表、全排列/子集、最长递增子序列、编辑距离、二分查找系列。
- **第二梯队（高频，需能手撕 + 讲复杂度）**：环形链表、删除倒数第 N 节点、二叉树 LCA、最大子数组和、跳跃游戏、盛水容器、滑动窗口最大值、前 K 高频、岛屿数量、买卖股票、零钱兑换、归并/快排手写、和为 K 的子数组、最小覆盖子串。
- **第三梯队（中频/加分）**：并查集、单调栈（柱状矩形）、LFU、Trie、拓扑进阶、位运算、DP 背包/股票多笔、N 皇后、螺旋矩阵、堆排序。

---

## 数组与字符串

### 两数之和 `#1`

- **频率**：高（哈希表入门母题）
- **核心思路**：哈希表存「值 → 下标」，边遍历边查 `target - nums[i]` 是否已出现。
- **复杂度**：O(n)
- 🔗 [LeetCode #1](https://leetcode.cn/problems/two-sum/)

**📌 原题**
给定一个整数数组 `nums` 和一个整数目标值 `target`，请在数组中找出**和为目标值**的那**两个**整数，并返回它们的数组下标。

- 示例：`nums = [2,7,11,15], target = 9` → 返回 `[0,1]`（因为 `2+7=9`）
- 约束：可以假设每种输入只会对应一个答案；同一个元素不能使用两遍；`2 <= nums.length <= 10^4`。

**✅ 标准答案**

```js
function twoSum(nums, target) {
  const map = new Map() // 值 -> 下标
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i]
    if (map.has(need)) return [map.get(need), i] // 先查后插，避免同一元素复用
    map.set(nums[i], i)
  }
  return []
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 合并区间 `#56`

- **频率**：中高（腾讯/字节常考）
- **复杂度**：O(n log n)
- 🔗 [LeetCode #56](https://leetcode.cn/problems/merge-intervals/)

**📌 原题**
以数组 `intervals` 表示若干个区间的集合，其中单个区间为 `intervals[i] = [starti, endi]`。请合并所有重叠的区间，并返回一个不重叠区间的数组。

- 示例：`[[1,3],[2,6],[8,10],[15,18]]` → `[[1,6],[8,10],[15,18]]`
- 约束：`1 <= intervals.length <= 10^4`，`intervals[i].length == 2`。

**✅ 标准答案**

```js
function merge(intervals) {
  intervals.sort((a, b) => a[0] - b[0]) // 必须按左端点排序
  const res = [intervals[0].slice()]
  for (let i = 1; i < intervals.length; i++) {
    const last = res[res.length - 1]
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]) // 重叠则取 max 右端点
    } else {
      res.push(intervals[i].slice())
    }
  }
  return res
}
```

时间复杂度 O(n log n)，空间复杂度 O(n)。

### 最长回文子串 `#5`

- **频率**：中高
- **复杂度**：O(n²)（中心扩展）/ O(n)（Manacher）
- 🔗 [LeetCode #5](https://leetcode.cn/problems/longest-palindromic-substring/)

**📌 原题**
给你一个字符串 `s`，找到 `s` 中最长的回文子串。

- 示例：`s = "babad"` → `"bab"` 或 `"aba"`；`s = "cbbd"` → `"bb"`
- 约束：`1 <= s.length <= 1000`。

**✅ 标准答案**

```js
function longestPalindrome(s) {
  if (!s) return ''
  let start = 0,
    maxLen = 1
  const expand = (l, r) => {
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      l--
      r++
    }
    const len = r - l - 1
    if (len > maxLen) {
      maxLen = len
      start = l + 1
    }
  }
  for (let i = 0; i < s.length; i++) {
    expand(i, i) // 奇数长度中心
    expand(i, i + 1) // 偶数长度中心
  }
  return s.slice(start, start + maxLen)
}
```

中心扩展时间复杂度 O(n²)，空间复杂度 O(1)。

### 最长公共前缀 `#14`

- **频率**：中
- **复杂度**：O(S)（所有字符串字符总长）
- 🔗 [LeetCode #14](https://leetcode.cn/problems/longest-common-prefix/)

**📌 原题**
编写一个函数来查找字符串数组中的最长公共前缀。如果不存在，返回空字符串 `""`。

- 示例：`strs = ["flower","flow","flight"]` → `"fl"`
- 约束：`1 <= strs.length <= 200`，`0 <= strs[i].length <= 200`。

**✅ 标准答案**

```js
function longestCommonPrefix(strs) {
  if (!strs.length) return ''
  let prefix = strs[0]
  for (const s of strs) {
    let i = 0
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++
    prefix = prefix.slice(0, i)
    if (!prefix) break
  }
  return prefix
}
```

时间复杂度 O(S)，空间复杂度 O(1)。

### 螺旋矩阵 `#54`

- **频率**：中（模拟类常考）
- **复杂度**：O(mn)
- 🔗 [LeetCode #54](https://leetcode.cn/problems/spiral-matrix/)

**📌 原题**
给你一个 `m` 行 `n` 列的矩阵 `matrix`，请按照**顺时针螺旋顺序**，返回矩阵中的所有元素。

- 示例：`matrix = [[1,2,3],[4,5,6],[7,8,9]]` → `[1,2,3,6,9,8,7,4,5]`

**✅ 标准答案**

```js
function spiralOrder(matrix) {
  const res = []
  if (!matrix.length) return res
  let top = 0,
    bottom = matrix.length - 1
  let left = 0,
    right = matrix[0].length - 1
  while (top <= bottom && left <= right) {
    for (let i = left; i <= right; i++) res.push(matrix[top][i])
    top++
    for (let i = top; i <= bottom; i++) res.push(matrix[i][right])
    right--
    if (top <= bottom) {
      for (let i = right; i >= left; i--) res.push(matrix[bottom][i])
      bottom--
    }
    if (left <= right) {
      for (let i = bottom; i >= top; i--) res.push(matrix[i][left])
      left++
    }
  }
  return res
}
```

时间复杂度 O(mn)，空间复杂度 O(1)（不计输出）。

---

## 双指针

### 三数之和 `#15`

- **频率**：高（双指针经典题）
- **复杂度**：O(n²)
- **易错点**：去重逻辑是最易翻车点，用 `while` 跳过重复元素避免结果集重复。
- 🔗 [LeetCode #15](https://leetcode.cn/problems/3sum/)

**📌 原题**
给你一个整数数组 `nums`，判断是否存在三个元素 `a, b, c` 使得 `a + b + c = 0`？请找出**所有**和为 0 且不重复的三元组。

- 示例：`nums = [-1,0,1,2,-1,-4]` → `[[-1,-1,2],[-1,0,1]]`
- 约束：`0 <= nums.length <= 3000`。

**✅ 标准答案**

```js
function threeSum(nums) {
  nums.sort((a, b) => a - b)
  const res = []
  for (let i = 0; i < nums.length - 2; i++) {
    if (nums[i] > 0) break
    if (i > 0 && nums[i] === nums[i - 1]) continue // 外层去重
    let l = i + 1,
      r = nums.length - 1
    while (l < r) {
      const sum = nums[i] + nums[l] + nums[r]
      if (sum === 0) {
        res.push([nums[i], nums[l], nums[r]])
        while (l < r && nums[l] === nums[l + 1]) l++ // 内层去重
        while (l < r && nums[r] === nums[r - 1]) r--
        l++
        r--
      } else if (sum < 0) l++
      else r--
    }
  }
  return res
}
```

时间复杂度 O(n²)，空间复杂度 O(1)（不计输出）。

### 盛最多水的容器 `#11`

- **频率**：高
- **复杂度**：O(n)
- 🔗 [LeetCode #11](https://leetcode.cn/problems/container-with-most-water/)

**📌 原题**
给定一个长度为 `n` 的整数数组 `height`，有 `n` 条垂直线，第 `i` 条线的两个端点是 `(i, 0)` 和 `(i, height[i])`。找出其中的两条线，使得它们与 x 轴共同构成的容器可以容纳最多的水，返回最大容量。

- 示例：`height = [1,8,6,2,5,4,8,3,7]` → `49`
- 约束：`n == height.length`，`2 <= n <= 10^5`。

**✅ 标准答案**

```js
function maxArea(height) {
  let l = 0,
    r = height.length - 1,
    max = 0
  while (l < r) {
    const h = Math.min(height[l], height[r])
    max = Math.max(max, h * (r - l))
    if (height[l] < height[r])
      l++ // 移动较矮的一端（短板限制面积）
    else r--
  }
  return max
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 接雨水 `#42`

- **频率**：高（Hard，区分度强）
- **复杂度**：双指针 O(n) / 空间 O(1)；单调栈 O(n)
- **易错点**：双指针法需理解 `left_max`/`right_max` 含义；能对比逐列 / DP / 单调栈三种解法是大加分。
- 🔗 [LeetCode #42](https://leetcode.cn/problems/trapping-rain-water/)

**📌 原题**
给定 `n` 个非负整数表示每个宽度为 1 的柱子的高度图，计算按此排列的柱子，下雨之后能接多少雨水。

- 示例：`height = [0,1,0,2,1,0,1,3,2,1,2,1]` → `6`
- 约束：`n == height.length`，`1 <= n <= 2*10^4`。

**✅ 标准答案**

```js
// 双指针：某位置能接的雨水量 = min(左侧最高, 右侧最高) - 当前高度
function trap(height) {
  let l = 0,
    r = height.length - 1
  let leftMax = 0,
    rightMax = 0,
    water = 0
  while (l < r) {
    if (height[l] < height[r]) {
      leftMax = Math.max(leftMax, height[l])
      water += leftMax - height[l]
      l++
    } else {
      rightMax = Math.max(rightMax, height[r])
      water += rightMax - height[r]
      r--
    }
  }
  return water
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 移动零 `#283`

- **频率**：中（原地双指针经典）
- **复杂度**：O(n)
- 🔗 [LeetCode #283](https://leetcode.cn/problems/move-zeroes/)

**📌 原题**
给定一个数组 `nums`，编写一个函数将所有 `0` 移动到数组的末尾，同时**保持非零元素的相对顺序**（必须在原数组上操作，不要新建数组）。

- 示例：`nums = [0,1,0,3,12]` → `[1,3,12,0,0]`

**✅ 标准答案**

```js
function moveZeroes(nums) {
  let k = 0 // 指向下一个非零应放位置
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== 0) {
      ;[nums[k], nums[i]] = [nums[i], nums[k]]
      k++
    }
  }
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 颜色分类 `#75`

- **频率**：中（三路快排思想）
- **复杂度**：O(n)
- 🔗 [LeetCode #75](https://leetcode.cn/problems/sort-colors/)

**📌 原题**
给定一个包含红色、白色和蓝色，一共 `n` 个元素的数组 `nums`，原地对它们进行排序，使得相同颜色的元素相邻，并按照红色（0）、白色（1）、蓝色（2）顺序排列（即荷兰国旗问题）。

- 示例：`nums = [2,0,2,1,1,0]` → `[0,0,1,1,2,2]`

**✅ 标准答案**

```js
function sortColors(nums) {
  let l = 0,
    r = nums.length - 1,
    i = 0
  while (i <= r) {
    if (nums[i] === 0) {
      ;[nums[l], nums[i]] = [nums[i], nums[l]]
      l++
      i++
    } else if (nums[i] === 2) {
      ;[nums[r], nums[i]] = [nums[i], nums[r]]
      r--
    } else i++
  }
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

---

## 哈希表

> 两数之和见「数组与字符串」#1

### 字母异位词分组 `#49`

- **频率**：中
- **复杂度**：O(n·k log k)（k 为字符串长度）
- 🔗 [LeetCode #49](https://leetcode.cn/problems/group-anagrams/)

**📌 原题**
给你一个字符串数组 `strs`，请你将**字母异位词**组合在一起。可以按任意顺序返回结果列表。

- 示例：`strs = ["eat","tea","tan","ate","nat","bat"]` → `[["bat"],["nat","tan"],["ate","eat","tea"]]`

**✅ 标准答案**

```js
function groupAnagrams(strs) {
  const map = new Map()
  for (const s of strs) {
    const key = s.split('').sort().join('') // 排序后的串作为 key
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(s)
  }
  return [...map.values()]
}
```

时间复杂度 O(n·k log k)，空间复杂度 O(n·k)。

### 最长连续序列 `#128`

- **频率**：中高
- **复杂度**：O(n)（均摊）
- **易错点**：必须从序列起点扩展，否则重复计算；要求 O(n) 不能先排序。
- 🔗 [LeetCode #128](https://leetcode.cn/problems/longest-consecutive-sequence/)

**📌 原题**
给定一个未排序的整数数组 `nums`，找出数字连续的最长序列（不要求序列元素在原数组中连续）的长度。要求算法时间复杂度 O(n)。

- 示例：`nums = [100,4,200,1,3,2]` → `4`（序列 `[1,2,3,4]`）

**✅ 标准答案**

```js
function longestConsecutive(nums) {
  const set = new Set(nums)
  let max = 0
  for (const num of set) {
    if (set.has(num - 1)) continue // 只从序列起点扩展
    let cur = num,
      len = 1
    while (set.has(cur + 1)) {
      cur++
      len++
    }
    max = Math.max(max, len)
  }
  return max
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

---

## 滑动窗口

### 无重复字符的最长子串 `#3`

- **频率**：高（滑动窗口母题）
- **复杂度**：O(n)
- **易错点**：左指针用 `max(left, map.get(c)+1)` 而非简单 +1，否则回退。
- 🔗 [LeetCode #3](https://leetcode.cn/problems/longest-substring-without-repeating-characters/)

**📌 原题**
给定一个字符串 `s`，请你找出其中不含有重复字符的**最长子串**的长度。

- 示例：`s = "abcabcbb"` → `3`（`"abc"`）；`s = "bbbbb"` → `1`
- 约束：`0 <= s.length <= 5*10^4`。

**✅ 标准答案**

```js
function lengthOfLongestSubstring(s) {
  const map = new Map()
  let left = 0,
    max = 0
  for (let right = 0; right < s.length; right++) {
    const c = s[right]
    if (map.has(c) && map.get(c) >= left) {
      left = map.get(c) + 1 // 左指针跳到重复字符之后
    }
    map.set(c, right)
    max = Math.max(max, right - left + 1)
  }
  return max
}
```

时间复杂度 O(n)，空间复杂度 O(min(n, 字符集))。

### 最小覆盖子串 `#76`

- **频率**：中高（Hard）
- **复杂度**：O(|S|+|T|)
- **易错点**：valid 计数与 need 表匹配逻辑；结果为空的处理。
- 🔗 [LeetCode #76](https://leetcode.cn/problems/minimum-window-substring/)

**📌 原题**
给定字符串 `s` 和 `t`，返回 `s` 中涵盖 `t` 所有字符的最小子串。如果 `s` 中不存在涵盖 `t` 所有字符的子串，则返回空字符串 `""`。

- 示例：`s = "ADOBECODEBANC", t = "ABC"` → `"BANC"`
- 约束：`1 <= s.length, t.length <= 10^5`。

**✅ 标准答案**

```js
function minWindow(s, t) {
  const need = new Map()
  for (const c of t) need.set(c, (need.get(c) || 0) + 1)
  let left = 0,
    valid = 0,
    start = 0,
    minLen = Infinity
  const window = new Map()
  for (let right = 0; right < s.length; right++) {
    const c = s[right]
    if (need.has(c)) {
      window.set(c, (window.get(c) || 0) + 1)
      if (window.get(c) === need.get(c)) valid++
    }
    while (valid === need.size) {
      // 满足所有字符需求
      if (right - left + 1 < minLen) {
        minLen = right - left + 1
        start = left
      }
      const d = s[left]
      if (need.has(d)) {
        if (window.get(d) === need.get(d)) valid--
        window.set(d, window.get(d) - 1)
      }
      left++ // 收缩左边界到最小
    }
  }
  return minLen === Infinity ? '' : s.slice(start, start + minLen)
}
```

时间复杂度 O(|S|+|T|)，空间复杂度 O(|字符集|)。

### 滑动窗口最大值 `#239`

- **频率**：高（Hard，单调队列经典）
- **复杂度**：O(n)
- **易错点**：队列存下标便于判断是否在窗口内；左边界踢出过期下标。
- 🔗 [LeetCode #239](https://leetcode.cn/problems/sliding-window-maximum/)

**📌 原题**
给你一个整数数组 `nums`，有一个大小为 `k` 的滑动窗口从数组的最左侧移动到最右侧。你只可以看到在滑动窗口内的 `k` 个数字。返回滑动窗口中的**最大值**。

- 示例：`nums = [1,3,-1,-3,5,3,6,7], k = 3` → `[3,3,5,5,6,7]`
- 约束：`1 <= k <= nums.length <= 10^5`。

**✅ 标准答案**

```js
function maxSlidingWindow(nums, k) {
  const deque = [] // 存下标，单调递减
  const res = []
  for (let i = 0; i < nums.length; i++) {
    while (deque.length && nums[deque[deque.length - 1]] <= nums[i]) deque.pop()
    deque.push(i)
    if (deque[0] === i - k) deque.shift() // 踢出窗口外的过期下标
    if (i >= k - 1) res.push(nums[deque[0]]) // 队首即当前窗口最大值
  }
  return res
}
```

时间复杂度 O(n)，空间复杂度 O(k)。

### 长度最小的子数组 `#209`

- **频率**：中
- **复杂度**：O(n)
- 🔗 [LeetCode #209](https://leetcode.cn/problems/minimum-size-subarray-sum/)

**📌 原题**
给定一个含有 `n` 个正整数的数组和一个正整数 `target`，找出该数组中满足其和 `>= target` 的长度最小的**连续子数组**，返回其长度。若不存在返回 0。

- 示例：`target = 7, nums = [2,3,1,2,4,3]` → `2`（`[4,3]`）

**✅ 标准答案**

```js
function minSubArrayLen(target, nums) {
  let left = 0,
    sum = 0,
    minLen = Infinity
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right]
    while (sum >= target) {
      minLen = Math.min(minLen, right - left + 1)
      sum -= nums[left++]
    }
  }
  return minLen === Infinity ? 0 : minLen
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

---

## 栈与队列

### 有效的括号 `#20`

- **频率**：高（栈的基础题）
- **复杂度**：O(n)
- **易错点**：栈空时遇右括号直接 false；用哈希表映射右→左更优雅。
- 🔗 [LeetCode #20](https://leetcode.cn/problems/valid-parentheses/)

**📌 原题**
给定一个只包括 `'('`，`')'`，`'{'`，`'}'`，`'['`，`']'` 的字符串 `s`，判断字符串是否有效。有效需满足：左括号必须用相同类型的右括号闭合，且必须以正确的顺序闭合。

- 示例：`s = "()[]{}"` → `true`；`s = "(]"` → `false`

**✅ 标准答案**

```js
function isValid(s) {
  const map = { ')': '(', ']': '[', '}': '{' }
  const stack = []
  for (const c of s) {
    if (c in map) {
      // 右括号
      if (stack.pop() !== map[c]) return false
    } else stack.push(c) // 左括号
  }
  return stack.length === 0
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 最小栈 `#155`

- **频率**：中高
- **复杂度**：O(1) 每操作
- 🔗 [LeetCode #155](https://leetcode.cn/problems/min-stack/)

**📌 原题**
设计一个支持 `push`、`pop`、`top` 操作，并能在常数时间内检索到最小元素的栈。实现 `MinStack` 类：`push(x)`、`pop()`、`top()` 返回栈顶、`getMin()` 检索最小值，均 O(1)。

- 示例：`push(-2); push(0); push(-3); getMin() -> -3; pop(); top() -> 0; getMin() -> -2`

**✅ 标准答案**

```js
class MinStack {
  constructor() {
    this.stack = []
    this.minStack = []
  }
  push(x) {
    this.stack.push(x)
    const min = this.minStack.length ? this.minStack[this.minStack.length - 1] : x
    this.minStack.push(Math.min(min, x))
  }
  pop() {
    this.stack.pop()
    this.minStack.pop()
  }
  top() {
    return this.stack[this.stack.length - 1]
  }
  getMin() {
    return this.minStack[this.minStack.length - 1]
  }
}
```

时间复杂度 O(1)，空间复杂度 O(n)。

### 每日温度 `#739`

- **频率**：中高（单调栈入门）
- **复杂度**：O(n)
- 🔗 [LeetCode #739](https://leetcode.cn/problems/daily-temperatures/)

**📌 原题**
给定一个整数数组 `temperatures`，表示每天的温度，返回一个数组 `answer`，其中 `answer[i]` 是指对于第 `i` 天，下一个更高温度出现在几天后。如果之后都不会升高，存 `0`。

- 示例：`temperatures = [73,74,75,71,69,72,76,73]` → `[1,1,4,2,1,1,0,0]`

**✅ 标准答案**

```js
function dailyTemperatures(temperatures) {
  const res = new Array(temperatures.length).fill(0)
  const stack = [] // 单调递减栈，存下标
  for (let i = 0; i < temperatures.length; i++) {
    while (stack.length && temperatures[i] > temperatures[stack[stack.length - 1]]) {
      const idx = stack.pop()
      res[idx] = i - idx
    }
    stack.push(i)
  }
  return res
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 柱状图中最大的矩形 `#84`

- **频率**：中（Hard，单调栈进阶）
- **复杂度**：O(n)
- 🔗 [LeetCode #84](https://leetcode.cn/problems/largest-rectangle-in-histogram/)

**📌 原题**
给定 `n` 个非负整数，用来表示柱状图中各个柱子的高度。每个柱子彼此相邻，且宽度为 1。求在该柱状图中，能够勾勒出来的矩形的最大面积。

- 示例：`heights = [2,1,5,6,2,3]` → `10`（高度 5 和 6 组成的宽 2 矩形）
- 约束：`1 <= heights.length <= 10^5`。

**✅ 标准答案**

```js
function largestRectangleArea(heights) {
  const stack = [] // 单调递增栈，存下标
  let max = 0
  const h = [...heights, 0] // 末尾哨兵，触发清空
  for (let i = 0; i < h.length; i++) {
    while (stack.length && h[i] < h[stack[stack.length - 1]]) {
      const height = h[stack.pop()]
      const width = stack.length ? i - stack[stack.length - 1] - 1 : i
      max = Math.max(max, height * width)
    }
    stack.push(i)
  }
  return max
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 用栈实现队列 `#232` / 用队列实现栈 `#225`

- **频率**：中（设计类基础）
- **复杂度**：均摊 O(1)
- 🔗 [LeetCode #232](https://leetcode.cn/problems/implement-queue-using-stacks/) / [LeetCode #225](https://leetcode.cn/problems/implement-stack-using-queues/)

**📌 原题**

- #232：仅用两个栈实现先入先出队列（`push`、`pop`、`peek`、`empty`）。
- #225：仅用两个队列实现栈（`push`、`pop`、`top`、`empty`）。

**✅ 标准答案**

```js
// 用栈实现队列：输入栈 + 输出栈
class MyQueue {
  constructor() {
    this.in = []
    this.out = []
  }
  push(x) {
    this.in.push(x)
  }
  pop() {
    if (!this.out.length) while (this.in.length) this.out.push(this.in.pop())
    return this.out.pop()
  }
  peek() {
    if (!this.out.length) while (this.in.length) this.out.push(this.in.pop())
    return this.out[this.out.length - 1]
  }
  empty() {
    return !this.in.length && !this.out.length
  }
}
```

时间复杂度均摊 O(1)，空间复杂度 O(n)。

## 链表

### 反转链表 `#206`

- **频率**：高（链表基础题）
- **复杂度**：O(n)
- **易错点**：递归法需在归的过程中接好 `head.next.next = head` 并断开防环。
- 🔗 [LeetCode #206](https://leetcode.cn/problems/reverse-linked-list/)

**📌 原题**
给你单链表的头节点 `head`，请你反转链表，并返回反转后的链表的头节点。

- 示例：`head = [1,2,3,4,5]` → `[5,4,3,2,1]`
- 约束：链表中节点数目范围 `[0, 5000]`。

**✅ 标准答案**

```js
// 迭代三指针
function reverseList(head) {
  let prev = null,
    cur = head
  while (cur) {
    const next = cur.next
    cur.next = prev
    prev = cur
    cur = next
  }
  return prev
}
// 递归版
function reverseListRec(head, prev = null) {
  if (!head) return prev
  const next = head.next
  head.next = prev
  return reverseListRec(next, head)
}
```

时间复杂度 O(n)，空间复杂度迭代 O(1)、递归 O(n)。

### 合并两个有序链表 `#21`

- **频率**：高（链表合并基础题）
- **复杂度**：O(n+m)
- 🔗 [LeetCode #21](https://leetcode.cn/problems/merge-two-sorted-lists/)

**📌 原题**
将两个升序链表合并为一个新的**升序**链表并返回。新链表是通过拼接给定的两个链表的所有节点组成的。

- 示例：`l1 = [1,2,4], l2 = [1,3,4]` → `[1,1,2,3,4,4]`

**✅ 标准答案**

```js
function mergeTwoLists(l1, l2) {
  const dummy = new ListNode(0)
  let cur = dummy
  while (l1 && l2) {
    if (l1.val <= l2.val) {
      cur.next = l1
      l1 = l1.next
    } else {
      cur.next = l2
      l2 = l2.next
    }
    cur = cur.next
  }
  cur.next = l1 || l2 // 接上剩余部分
  return dummy.next
}
```

时间复杂度 O(n+m)，空间复杂度 O(1)（不计新节点）。

### 环形链表 II `#142`

- **频率**：高（快慢指针经典）
- **复杂度**：O(n)
- **易错点**：II 的"相遇后头节点与相遇点同速走"推导是高频追问。
- 🔗 [LeetCode #142](https://leetcode.cn/problems/linked-list-cycle-ii/)

**📌 原题**
给定一个链表的头节点 `head`，返回链表开始入环的第一个节点。如果链表无环，则返回 `null`。

- 示例：链表在位置 `-1` 处成环 → 返回索引为 `-1` 的节点（即环入口）。
- 约束：`-10^5 <= Node.val <= 10^5`。

**✅ 标准答案**

```js
function detectCycle(head) {
  let slow = head,
    fast = head
  while (fast && fast.next) {
    slow = slow.next
    fast = fast.next.next
    if (slow === fast) {
      // 相遇则有环
      let p = head
      while (p !== slow) {
        p = p.next
        slow = slow.next
      } // 同速走求入口
      return p
    }
  }
  return null
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 删除链表的倒数第 N 个节点 `#19`

- **频率**：高
- **复杂度**：O(n)
- **易错点**：用 dummy 节点避免删头节点特判。
- 🔗 [LeetCode #19](https://leetcode.cn/problems/remove-nth-node-from-end-of-list/)

**📌 原题**
给你一个链表，删除链表的倒数第 `n` 个节点，并返回链表的头节点。

- 示例：`head = [1,2,3,4,5], n = 2` → `[1,2,3,5]`
- 约束：`1 <= n <= sz`（链表长度）。

**✅ 标准答案**

```js
function removeNthFromEnd(head, n) {
  const dummy = new ListNode(0, head)
  let fast = dummy,
    slow = dummy
  for (let i = 0; i <= n; i++) fast = fast.next // 快指针先走 n+1 步
  while (fast) {
    fast = fast.next
    slow = slow.next
  }
  slow.next = slow.next.next // slow 指向待删前驱
  return dummy.next
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 两数相加 `#2`

- **频率**：高（字节常考）
- **复杂度**：O(max(n,m))
- 🔗 [LeetCode #2](https://leetcode.cn/problems/add-two-numbers/)

**📌 原题**
给你两个**非空**的链表，表示两个非负的整数。它们每位数字都是按照**逆序**的方式存储的，并且每个节点只能存储一位数字。请你将两个数相加，并以相同形式返回一个表示和的链表。

- 示例：`l1 = [2,4,3], l2 = [5,6,4]` → `[7,0,8]`（342 + 465 = 807）
- 约束：每个链表中的节点数在 `[1, 100]` 内。

**✅ 标准答案**

```js
function addTwoNumbers(l1, l2) {
  const dummy = new ListNode(0)
  let cur = dummy,
    carry = 0
  while (l1 || l2 || carry) {
    const sum = (l1 ? l1.val : 0) + (l2 ? l2.val : 0) + carry
    cur.next = new ListNode(sum % 10)
    carry = Math.floor(sum / 10)
    cur = cur.next
    l1 = l1 && l1.next
    l2 = l2 && l2.next
  }
  return dummy.next
}
```

时间复杂度 O(max(n,m))，空间复杂度 O(max(n,m))。

### 合并 K 个升序链表 `#23`

- **频率**：中高（Hard，堆/分治）
- **复杂度**：O(N log K)（N 为总节点数）
- 🔗 [LeetCode #23](https://leetcode.cn/problems/merge-k-sorted-lists/)

**📌 原题**
给你一个链表数组，每个链表都已经按**升序排列**。请你将所有链表合并到一个升序链表中，返回合并后的链表。

- 示例：`lists = [[1,4,5],[1,3,4],[2,6]]` → `[1,1,2,3,4,4,5,6]`
- 约束：`k == lists.length`，`0 <= k <= 10^4`。

**✅ 标准答案**

```js
function mergeKLists(lists) {
  const dummy = new ListNode(0)
  let cur = dummy
  // 小顶堆：用数组 + 排序模拟（实际可用优先队列库）
  const heap = lists.filter(Boolean)
  while (heap.length) {
    let minIdx = 0
    for (let i = 1; i < heap.length; i++) {
      if (heap[i].val < heap[minIdx].val) minIdx = i
    }
    cur.next = heap[minIdx]
    cur = cur.next
    heap[minIdx] = heap[minIdx].next
    if (!heap[minIdx]) heap.splice(minIdx, 1) // 该链表取完则移除
  }
  return dummy.next
}
```

时间复杂度 O(N log K)，空间复杂度 O(K)。

### 相交链表 `#160`

- **频率**：中
- **复杂度**：O(n+m)
- 🔗 [LeetCode #160](https://leetcode.cn/problems/intersection-of-two-linked-lists/)

**📌 原题**
给你两个单链表的头节点 `headA` 和 `headB`，请你找出并返回两个单链表相交的起始节点。如果两个链表不存在相交节点，返回 `null`。（要求 O(n) 时间、O(1) 空间，且不能修改原链表。）

- 示例：相交于节点 `8` → 返回该节点。

**✅ 标准答案**

```js
function getIntersectionNode(headA, headB) {
  let p = headA,
    q = headB
  while (p !== q) {
    p = p ? p.next : headB // 走完自己走对方
    q = q ? q.next : headA
  }
  return p // 相遇点即交点（或同为 null）
}
```

时间复杂度 O(n+m)，空间复杂度 O(1)。

### 回文链表 `#234`

- **频率**：中
- **复杂度**：O(n)
- 🔗 [LeetCode #234](https://leetcode.cn/problems/palindrome-linked-list/)

**📌 原题**
给你一个单链表的头节点 `head`，请你判断该链表是否为**回文链表**。若是返回 `true`，否则 `false`。

- 示例：`head = [1,2,2,1]` → `true`；`[1,2]` → `false`
- 约束：链表节点数目 `[1, 10^5]`。

**✅ 标准答案**

```js
function isPalindrome(head) {
  // 快慢指针找中点
  let slow = head,
    fast = head
  while (fast && fast.next) {
    slow = slow.next
    fast = fast.next.next
  }
  // 反转后半段
  let prev = null
  while (slow) {
    const next = slow.next
    slow.next = prev
    prev = slow
    slow = next
  }
  // 双指针比较
  let left = head,
    right = prev
  while (right) {
    if (left.val !== right.val) return false
    left = left.next
    right = right.next
  }
  return true
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

---

## 二叉树与遍历

### 四种遍历 `#94/#144/#145/#102`

- **频率**：高（递归 + 迭代两种写法都要会）
- **复杂度**：O(n)
- 🔗 [LeetCode #94](https://leetcode.cn/problems/binary-tree-inorder-traversal/) / [#144](https://leetcode.cn/problems/binary-tree-preorder-traversal/) / [#145](https://leetcode.cn/problems/binary-tree-postorder-traversal/) / [#102](https://leetcode.cn/problems/binary-tree-level-order-traversal/)

**📌 原题**

- 前序：根 → 左 → 右；中序：左 → 根 → 右；后序：左 → 右 → 根；层序：逐层从左到右。
- 示例：`root = [1,null,2,3]` → 前序 `[1,2,3]`，中序 `[1,3,2]`，后序 `[3,2,1]`，层序 `[[1],[2],[3]]`。

**✅ 标准答案**

```js
// 递归版（前/中/后只需调整三行顺序）
function inorder(root, res = []) {
  if (!root) return res
  inorder(root.left, res)
  res.push(root.val)
  inorder(root.right, res)
  return res
}
// 层序（BFS）
function levelOrder(root) {
  if (!root) return []
  const res = [],
    queue = [root]
  while (queue.length) {
    const level = [],
      n = queue.length
    for (let i = 0; i < n; i++) {
      const node = queue.shift()
      level.push(node.val)
      if (node.left) queue.push(node.left)
      if (node.right) queue.push(node.right)
    }
    res.push(level)
  }
  return res
}
```

时间复杂度 O(n)，空间复杂度 O(n)（递归栈 / 队列）。

### 二叉树的最大深度 `#104`

- **频率**：高（二叉树基础题）
- **复杂度**：O(n)
- 🔗 [LeetCode #104](https://leetcode.cn/problems/maximum-depth-of-binary-tree/)

**📌 原题**
给定一个二叉树 `root`，返回其最大深度。二叉树的最大深度是指从根节点到最远叶子节点的最长路径上的节点数。

- 示例：`root = [3,9,20,null,null,15,7]` → `3`

**✅ 标准答案**

```js
function maxDepth(root) {
  if (!root) return 0
  return 1 + Math.max(maxDepth(root.left), maxDepth(root.right))
}
```

时间复杂度 O(n)，空间复杂度 O(h)（h 为树高）。

### 验证二叉搜索树 `#98`

- **频率**：高（BST 经典题）
- **复杂度**：O(n)
- **易错点**：不能只比左右子节点，要满足整棵子树都在 (min,max) 区间。
- 🔗 [LeetCode #98](https://leetcode.cn/problems/validate-binary-search-tree/)

**📌 原题**
给你一个二叉树的根节点 `root`，判断其是否是一个有效的二叉搜索树（BST）。BST 定义：节点的左子树只包含**小于**当前节点的数；右子树只包含**大于**当前节点的数；左右子树也必须是 BST。

- 示例：`root = [2,1,3]` → `true`；`[5,1,4,null,null,3,6]` → `false`

**✅ 标准答案**

```js
function isValidBST(root) {
  const dfs = (node, min, max) => {
    if (!node) return true
    if ((min !== null && node.val <= min) || (max !== null && node.val >= max)) return false
    return dfs(node.left, min, node.val) && dfs(node.right, node.val, max)
  }
  return dfs(root, null, null)
}
```

时间复杂度 O(n)，空间复杂度 O(h)。

### 二叉树的最近公共祖先 `#236`

- **频率**：高
- **复杂度**：O(n)
- 🔗 [LeetCode #236](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/)

**📌 原题**
给定一个二叉树，找到该树中两个指定节点 `p` 和 `q` 的最近公共祖先（LCA）。（节点本身可视为自己的祖先。）

- 示例：`root = [3,5,1,6,2,0,8,...], p=5, q=1` → `3`

**✅ 标准答案**

```js
function lowestCommonAncestor(root, p, q) {
  if (!root || root === p || root === q) return root // 找到 p 或 q 即向上传递
  const left = lowestCommonAncestor(root.left, p, q)
  const right = lowestCommonAncestor(root.right, p, q)
  if (left && right) return root // 分处左右子树，当前即 LCA
  return left || right
}
```

时间复杂度 O(n)，空间复杂度 O(h)。

### 二叉树的直径 `#543`

- **频率**：中高
- **复杂度**：O(n)
- 🔗 [LeetCode #543](https://leetcode.cn/problems/diameter-of-binary-tree/)

**📌 原题**
给你一棵二叉树的根节点，返回该树的**直径**。二叉树的直径是指树中任意两个节点之间最长路径上的**边数**。这条路径可能穿过也可能不穿过根节点。

- 示例：`[1,2,3,4,5]`（1-2-4 与 1-3-5）→ `3`（路径 4-2-1-3 或 4-2-1-3-5 边数 3）

**✅ 标准答案**

```js
function diameterOfBinaryTree(root) {
  let max = 0
  const depth = (node) => {
    if (!node) return 0
    const l = depth(node.left)
    const r = depth(node.right)
    max = Math.max(max, l + r) // 经过该节点的最长路径 = 左深 + 右深
    return 1 + Math.max(l, r)
  }
  depth(root)
  return max
}
```

时间复杂度 O(n)，空间复杂度 O(h)。

### 二叉树中的最大路径和 `#124`

- **频率**：中（Hard）
- **复杂度**：O(n)
- 🔗 [LeetCode #124](https://leetcode.cn/problems/binary-tree-maximum-path-sum/)

**📌 原题**
二叉树中的**路径**被定义为一条节点序列，序列中每对相邻节点之间都存在一条边。同一个节点在一条路径序列中**至多出现一次**。该路径**至少包含一个**节点，且不一定经过根节点。返回路径各节点值之和的**最大值**。

- 示例：`[1,2,3]` → `6`；`[1,-2,-3,1,3,-2,null,-1]` → `3`

**✅ 标准答案**

```js
function maxPathSum(root) {
  let max = -Infinity
  const gain = (node) => {
    if (!node) return 0
    const l = Math.max(0, gain(node.left)) // 负数贡献取 0
    const r = Math.max(0, gain(node.right))
    max = Math.max(max, l + r + node.val) // 以当前节点为最高点的路径和
    return Math.max(l, r) + node.val // 向上返回单侧最大贡献
  }
  gain(root)
  return max
}
```

时间复杂度 O(n)，空间复杂度 O(h)。

### 前序与中序构造二叉树 `#105`

- **频率**：中高
- **复杂度**：O(n)
- 🔗 [LeetCode #105](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/)

**📌 原题**
给定两个整数数组 `preorder` 和 `inorder`，其中 `preorder` 是二叉树的前序遍历，`inorder` 是同一棵树的中序遍历，请构造二叉树并返回其根节点。

- 示例：`preorder = [3,9,20,15,7], inorder = [9,3,15,20,7]` → 树 `[3,9,20,null,null,15,7]`

**✅ 标准答案**

```js
function buildTree(preorder, inorder) {
  if (!preorder.length) return null
  const rootVal = preorder[0]
  const idx = inorder.indexOf(rootVal) // 中序中根的位置
  const root = new TreeNode(rootVal)
  root.left = buildTree(preorder.slice(1, idx + 1), inorder.slice(0, idx))
  root.right = buildTree(preorder.slice(idx + 1), inorder.slice(idx + 1))
  return root
}
```

时间复杂度 O(n)（平均，indexOf 用哈希可优化），空间复杂度 O(n)。

### 二叉树的序列化与反序列化 `#297`

- **频率**：中（Hard，设计思维）
- **复杂度**：O(n)
- 🔗 [LeetCode #297](https://leetcode.cn/problems/serialize-and-deserialize-binary-tree/)

**📌 原题**
设计一个算法来序列化和反序列化**二叉树**。序列化即将二叉树转换为字符串，反序列化则将字符串恢复为原树结构。需保证正反向一致。

- 示例：`root = [1,2,3,null,null,4,5]` → 序列化为 `"1,2,3,null,null,4,5"`（层序）。

**✅ 标准答案**

```js
function serialize(root) {
  const res = []
  const dfs = (node) => {
    if (!node) {
      res.push('null')
      return
    }
    res.push(node.val)
    dfs(node.left)
    dfs(node.right)
  }
  dfs(root)
  return res.join(',')
}
function deserialize(data) {
  const vals = data.split(',')
  let i = 0
  const dfs = () => {
    if (vals[i] === 'null') {
      i++
      return null
    }
    const node = new TreeNode(Number(vals[i++]))
    node.left = dfs()
    node.right = dfs()
    return node
  }
  return dfs()
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### BST 中第 K 小的元素 `#230`

- **频率**：中
- **复杂度**：O(n) / 计数优化 O(h)
- 🔗 [LeetCode #230](https://leetcode.cn/problems/kth-smallest-element-in-a-bst/)

**📌 原题**
给定一个二叉搜索树的根节点 `root`，和一个整数 `k`，请你设计一个算法查找其中第 `k` 小的元素（从 1 开始计数）。

- 示例：`root = [3,1,4,null,2], k = 1` → `1`

**✅ 标准答案**

```js
function kthSmallest(root, k) {
  let count = 0,
    res = null
  const dfs = (node) => {
    if (!node || res !== null) return
    dfs(node.left)
    if (++count === k) {
      res = node.val
      return
    }
    dfs(node.right)
  }
  dfs(root)
  return res
}
```

时间复杂度 O(n)（中序第 k 个），空间复杂度 O(h)。

## 堆 / TopK

### 数组中的第 K 个最大元素 `#215`

- **频率**：高（TopK 母题）
- **复杂度**：堆 O(n log K)；快选 O(n) 平均
- 🔗 [LeetCode #215](https://leetcode.cn/problems/kth-largest-element-in-an-array/)

**📌 原题**
给定整数数组 `nums` 和整数 `k`，请返回数组中第 `k` 个最大的元素（注意是排序后的第 k 大，不是第 k 个不同的元素）。

- 示例：`nums = [3,2,1,5,6,4], k = 2` → `5`
- 约束：`1 <= k <= nums.length <= 10^5`。

**✅ 标准答案**

```js
// 快选（QuickSelect）平均 O(n)
function findKthLargest(nums, k) {
  const quick = (arr, l, r) => {
    const pivot = arr[r]
    let i = l
    for (let j = l; j < r; j++) {
      if (arr[j] >= pivot) {
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
        i++
      }
    }
    ;[arr[i], arr[r]] = [arr[r], arr[i]]
    if (i === k - 1) return arr[i]
    return i > k - 1 ? quick(arr, l, i - 1) : quick(arr, i + 1, r)
  }
  return quick(nums.slice(), 0, nums.length - 1)
}
```

时间复杂度平均 O(n)、最坏 O(n²)，空间复杂度 O(1)。

### 前 K 个高频元素 `#347`

- **频率**：中高
- **复杂度**：O(n log K)
- 🔗 [LeetCode #347](https://leetcode.cn/problems/top-k-frequent-elements/)

**📌 原题**
给你一个整数数组 `nums` 和一个整数 `k`，请你返回其中出现频率前 `k` 高的元素。可以按任意顺序返回答案。

- 示例：`nums = [1,1,1,2,2,3], k = 2` → `[1,2]`
- 约束：`1 <= k <= nums.length`。

**✅ 标准答案**

```js
function topKFrequent(nums, k) {
  const freq = new Map()
  for (const n of nums) freq.set(n, (freq.get(n) || 0) + 1)
  const arr = [...freq.entries()]
  arr.sort((a, b) => b[1] - a[1]) // 按频率降序
  return arr.slice(0, k).map((e) => e[0])
}
```

时间复杂度 O(n log n)（排序），空间复杂度 O(n)。

### 数据流的中位数 `#295`

- **频率**：中（Hard，设计题）
- **复杂度**：插入 O(log n)，查询 O(1)
- 🔗 [LeetCode #295](https://leetcode.cn/problems/find-median-from-data-stream/)

**📌 原题**
中位数是有序整数列表中中间的那个数。如果列表长度是偶数，中位数则是中间两个数的平均值。设计一个数据结构，支持 `addNum`（添加整数）和 `findMedian`（返回中位数）操作。

- 示例：`addNum(1); addNum(2); findMedian() -> 1.5; addNum(3); findMedian() -> 2`

**✅ 标准答案**

```js
class MedianFinder {
  constructor() {
    this.lo = []
    this.hi = []
  } // 大顶堆(较小半) + 小顶堆(较大半)
  addNum(num) {
    if (this.lo.length === 0 || num <= -this.lo[0]) {
      this.lo.push(-num)
      this.lo.sort((a, b) => a - b) // 简化：用 sort 模拟堆
    } else {
      this.hi.push(num)
      this.hi.sort((a, b) => a - b)
    }
    // 平衡两堆大小
    if (this.lo.length > this.hi.length + 1) this.hi.push(-this.lo.shift())
    if (this.hi.length > this.lo.length) this.lo.push(-this.hi.shift())
  }
  findMedian() {
    if (this.lo.length > this.hi.length) return -this.lo[0]
    return (-this.lo[0] + this.hi[0]) / 2
  }
}
```

时间复杂度插入 O(log n)、查询 O(1)，空间复杂度 O(n)。

---

## 图（DFS / BFS / 拓扑）

### 岛屿数量 `#200`

- **频率**：高（DFS/BFS 经典题）
- **复杂度**：O(mn)
- **易错点**：访问后必须标记（置 '0' 或 visited），防重复计数。
- 🔗 [LeetCode #200](https://leetcode.cn/problems/number-of-islands/)

**📌 原题**
给你一个由 `'1'`（陆地）和 `'0'`（水）组成的二维网格，请你计算网格中**岛屿的数量**。岛屿总是被水包围，并且每座岛屿只能由水平方向和/或竖直方向上相邻的陆地连接形成。

- 示例：`grid = [["1","1","0"],["1","0","0"],["0","0","1"]]` → `2`

**✅ 标准答案**

```js
function numIslands(grid) {
  if (!grid.length) return 0
  const m = grid.length,
    n = grid[0].length
  const dfs = (i, j) => {
    if (i < 0 || j < 0 || i >= m || j >= n || grid[i][j] === '0') return
    grid[i][j] = '0' // 标记已访问
    dfs(i + 1, j)
    dfs(i - 1, j)
    dfs(i, j + 1)
    dfs(i, j - 1)
  }
  let count = 0
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (grid[i][j] === '1') {
        dfs(i, j)
        count++
      }
    }
  }
  return count
}
```

时间复杂度 O(mn)，空间复杂度 O(mn)（递归栈）。

### 课程表 / 课程表 II `#207/#210`

- **频率**：高（拓扑排序必考）
- **复杂度**：O(V+E)
- **易错点**：#210 需记录出队顺序；补 DFS 三色法判环是加分项。
- 🔗 [LeetCode #207](https://leetcode.cn/problems/course-schedule/) / [#210](https://leetcode.cn/problems/course-schedule-ii/)

**📌 原题**

- #207：你这个学期必须选修 `numCourses` 门课程，给定先修关系 `prerequisites`（如 `[a,b]` 表示修 `a` 前须先修 `b`）。判断是否可能完成所有课程的学习？
- #210：在可完成的前提下，返回一种可能的上课顺序。
- 示例：`numCourses = 2, prerequisites = [[1,0]]` → #207 `true`；#210 `[0,1]`。

**✅ 标准答案**

```js
// Kahn 算法（BFS 拓扑）
function canFinish(numCourses, prerequisites) {
  const indeg = new Array(numCourses).fill(0)
  const adj = Array.from({ length: numCourses }, () => [])
  for (const [a, b] of prerequisites) {
    adj[b].push(a)
    indeg[a]++
  }
  const queue = []
  for (let i = 0; i < numCourses; i++) if (indeg[i] === 0) queue.push(i)
  let count = 0
  while (queue.length) {
    const cur = queue.shift()
    count++
    for (const next of adj[cur]) if (--indeg[next] === 0) queue.push(next)
  }
  return count === numCourses // 访问数 = 总数则无环
}
```

时间复杂度 O(V+E)，空间复杂度 O(V+E)。

### 单词搜索 `#79`

- **频率**：中（回溯 + 二维 DFS）
- **复杂度**：O(mn·3^L)
- 🔗 [LeetCode #79](https://leetcode.cn/problems/word-search/)

**📌 原题**
给定一个 `m x n` 二维字符网格 `board` 和一个字符串单词 `word`。如果 `word` 存在于网格中，返回 `true`。单词必须按照顺序，通过相邻单元格（水平/垂直）的字母构成，同一单元格内的字母不允许被重复使用。

- 示例：`board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCCED"` → `true`

**✅ 标准答案**

```js
function exist(board, word) {
  const m = board.length,
    n = board[0].length
  const dfs = (i, j, k) => {
    if (k === word.length) return true
    if (i < 0 || j < 0 || i >= m || j >= n || board[i][j] !== word[k]) return false
    const tmp = board[i][j]
    board[i][j] = '#' // 标记已访问
    const found =
      dfs(i + 1, j, k + 1) || dfs(i - 1, j, k + 1) || dfs(i, j + 1, k + 1) || dfs(i, j - 1, k + 1)
    board[i][j] = tmp // 回溯
    return found
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (dfs(i, j, 0)) return true
  return false
}
```

时间复杂度 O(mn·3^L)，空间复杂度 O(L)。

### 被围绕的区域 `#130`

- **频率**：中
- **复杂度**：O(mn)
- 🔗 [LeetCode #130](https://leetcode.cn/problems/surrounded-regions/)

**📌 原题**
给你一个 `m x n` 的矩阵 `board`，由若干字符 `'X'` 和 `'O'` 组成，捕获所有被围绕的区域：任何不在边界上，或不与边界上的 `'O'` 相连的 `'O'` 最终都被替换为 `'X'`。

- 示例：`board = [["X","X","X","X"],["X","O","O","X"],["X","X","O","X"],["X","O","X","X"]]` → 中间两个 `O` 变 `X`，边界 `O` 保留。

**✅ 标准答案**

```js
function solve(board) {
  if (!board.length) return
  const m = board.length,
    n = board[0].length
  const dfs = (i, j) => {
    if (i < 0 || j < 0 || i >= m || j >= n || board[i][j] !== 'O') return
    board[i][j] = '#' // 标记"不被包围"
    dfs(i + 1, j)
    dfs(i - 1, j)
    dfs(i, j + 1)
    dfs(i, j - 1)
  }
  for (let i = 0; i < m; i++) {
    dfs(i, 0)
    dfs(i, n - 1)
  } // 左右边界
  for (let j = 0; j < n; j++) {
    dfs(0, j)
    dfs(m - 1, j)
  } // 上下边界
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      if (board[i][j] === '#') board[i][j] = 'O'
      else if (board[i][j] === 'O') board[i][j] = 'X'
}
```

时间复杂度 O(mn)，空间复杂度 O(mn)。

### 冗余连接 `#684`

> 冗余连接的并查集标准解法见「并查集」#684

---

## 回溯

### 全排列 `#46`

- **频率**：高（腾讯/字节常考）
- **复杂度**：O(n!)
- 🔗 [LeetCode #46](https://leetcode.cn/problems/permutations/)

**📌 原题**
给定一个不含重复数字的数组 `nums`，返回其**所有可能的全排列**。你可以按任意顺序返回答案。

- 示例：`nums = [1,2,3]` → `[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]`

**✅ 标准答案**

```js
function permute(nums) {
  const res = []
  const backtrack = (path, used) => {
    if (path.length === nums.length) {
      res.push([...path])
      return
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue
      used[i] = true
      path.push(nums[i])
      backtrack(path, used)
      path.pop()
      used[i] = false // 撤销
    }
  }
  backtrack([], [])
  return res
}
```

时间复杂度 O(n·n!)，空间复杂度 O(n)。

### 子集 `#78`

- **频率**：高
- **复杂度**：O(2^n)
- 🔗 [LeetCode #78](https://leetcode.cn/problems/subsets/)

**📌 原题**
给你一个整数数组 `nums`，数组中不含重复元素，返回该数组所有可能的**子集（幂集）**。

- 示例：`nums = [1,2,3]` → `[[],[1],[2],[1,2],[3],[1,3],[2,3],[1,2,3]]`

**✅ 标准答案**

```js
function subsets(nums) {
  const res = []
  const backtrack = (start, path) => {
    res.push([...path]) // 每个节点都是一个子集
    for (let i = start; i < nums.length; i++) {
      path.push(nums[i])
      backtrack(i + 1, path) // start 避免重复组合
      path.pop()
    }
  }
  backtrack(0, [])
  return res
}
```

时间复杂度 O(n·2^n)，空间复杂度 O(n)。

### 组合总和 `#39`

- **频率**：高
- **复杂度**：O(2^n)（带剪枝）
- 🔗 [LeetCode #39](https://leetcode.cn/problems/combination-sum/)

**📌 原题**
给你一个**无重复元素**的整数数组 `candidates` 和一个目标整数 `target`，找出 `candidates` 中所有可以使数字和为 `target` 的组合。`candidates` 中的同一个数字可以**无限制重复**被选取。

- 示例：`candidates = [2,3,6,7], target = 7` → `[[2,2,3],[7]]`

**✅ 标准答案**

```js
function combinationSum(candidates, target) {
  const res = []
  const backtrack = (start, path, sum) => {
    if (sum === target) {
      res.push([...path])
      return
    }
    if (sum > target) return
    for (let i = start; i < candidates.length; i++) {
      path.push(candidates[i])
      backtrack(i, path, sum + candidates[i]) // 用 i 而非 i+1 可重复选
      path.pop()
    }
  }
  backtrack(0, [], 0)
  return res
}
```

时间复杂度 O(2^n)（带剪枝），空间复杂度 O(n)。

### 括号生成 `#22`

- **频率**：高
- **复杂度**：卡特兰数级 O(4^n/√n)
- 🔗 [LeetCode #22](https://leetcode.cn/problems/generate-parentheses/)

**📌 原题**
数字 `n` 代表生成括号的对数，请你设计一个函数，用于能够生成所有可能的并且**有效的**括号组合。

- 示例：`n = 3` → `["((()))","(()())","(())()","()(())","()()()"]`

**✅ 标准答案**

```js
function generateParenthesis(n) {
  const res = []
  const backtrack = (s, left, right) => {
    if (s.length === n * 2) {
      res.push(s)
      return
    }
    if (left < n) backtrack(s + '(', left + 1, right)
    if (right < left) backtrack(s + ')', left, right + 1) // 右 < 左 才能加右括号
  }
  backtrack('', 0, 0)
  return res
}
```

时间复杂度 O(4^n/√n)，空间复杂度 O(n)。

### N 皇后 `#51`

- **频率**：中高（Hard，经典回溯）
- **复杂度**：O(n!)
- 🔗 [LeetCode #51](https://leetcode.cn/problems/n-queens/)

**📌 原题**
按照国际象棋的规则，皇后可以攻击与之处在同一行、同一列以及同一斜线上的棋子。`n` 皇后问题研究的是如何将 `n` 个皇后放置在 `n×n` 的棋盘上，并且使皇后彼此之间不能相互攻击，返回所有不同的解。

- 示例：`n = 4` → 2 种解（`".Q..","...Q","Q...","..Q."` 等）

**✅ 标准答案**

```js
function solveNQueens(n) {
  const res = [],
    cols = new Set(),
    diag1 = new Set(),
    diag2 = new Set()
  const board = Array.from({ length: n }, () => '.'.repeat(n))
  const backtrack = (row) => {
    if (row === n) {
      res.push([...board])
      return
    }
    for (let col = 0; col < n; col++) {
      if (cols.has(col) || diag1.has(row - col) || diag2.has(row + col)) continue
      cols.add(col)
      diag1.add(row - col)
      diag2.add(row + col)
      board[row] = board[row].slice(0, col) + 'Q' + board[row].slice(col + 1)
      backtrack(row + 1)
      board[row] = board[row].slice(0, col) + '.' + board[row].slice(col + 1)
      cols.delete(col)
      diag1.delete(row - col)
      diag2.delete(row + col)
    }
  }
  backtrack(0)
  return res
}
```

时间复杂度 O(n!)，空间复杂度 O(n)。

### 电话号码的字母组合 `#17`

- **频率**：中
- 🔗 [LeetCode #17](https://leetcode.cn/problems/letter-combinations-of-a-phone-number/)

**📌 原题**
给定一个仅包含数字 `2-9` 的字符串 `digits`，返回所有它能表示的字母组合。答案可以按任意顺序返回（按键映射同电话键盘）。

- 示例：`digits = "23"` → `["ad","ae","af","bd","be","bf","cd","ce","cf"]`

**✅ 标准答案**

```js
function letterCombinations(digits) {
  if (!digits) return []
  const map = { 2: 'abc', 3: 'def', 4: 'ghi', 5: 'jkl', 6: 'mno', 7: 'pqrs', 8: 'tuv', 9: 'wxyz' }
  const res = []
  const backtrack = (i, s) => {
    if (i === digits.length) {
      res.push(s)
      return
    }
    for (const c of map[digits[i]]) backtrack(i + 1, s + c)
  }
  backtrack(0, '')
  return res
}
```

时间复杂度 O(3^m · 4^n)，空间复杂度 O(m+n)。

## 动态规划

### 爬楼梯 `#70`

- **频率**：高（入门 DP）
- **复杂度**：O(n)
- 🔗 [LeetCode #70](https://leetcode.cn/problems/climbing-stairs/)

**📌 原题**
假设你正在爬楼梯。需要 `n` 阶你才能到达楼顶。每次你可以爬 `1` 或 `2` 个台阶。你有多少种不同的方法可以爬到楼顶？

- 示例：`n = 2` → `2`（`1+1`、`2`）；`n = 3` → `3`
- 约束：`1 <= n <= 45`。

**✅ 标准答案**

```js
function climbStairs(n) {
  if (n <= 2) return n
  let a = 1,
    b = 2 // 滚动变量，空间 O(1)
  for (let i = 3; i <= n; i++) {
    ;[a, b] = [b, a + b]
  }
  return b
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 最大子数组和 `#53`

- **频率**：高（动态规划入门题）
- **复杂度**：O(n)
- 🔗 [LeetCode #53](https://leetcode.cn/problems/maximum-subarray/)

**📌 原题**
给你一个整数数组 `nums`，请你找出一个具有最大和的**连续子数组**（子数组最少包含一个元素），返回其最大和。

- 示例：`nums = [-2,1,-3,4,-1,2,1,-5,4]` → `6`（子数组 `[4,-1,2,1]`）
- 约束：`1 <= nums.length <= 10^5`。

**✅ 标准答案**

```js
function maxSubArray(nums) {
  let max = nums[0],
    cur = nums[0]
  for (let i = 1; i < nums.length; i++) {
    cur = Math.max(nums[i], cur + nums[i]) // Kadane：负贡献则重开
    max = Math.max(max, cur)
  }
  return max
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 最长递增子序列 `#300`

- **频率**：高
- **复杂度**：O(n²) / O(n log n)
- 🔗 [LeetCode #300](https://leetcode.cn/problems/longest-increasing-subsequence/)

**📌 原题**
给你一个整数数组 `nums`，找到其中**最长严格递增子序列**的长度。子序列是由数组派生而来的序列，删除（或不删除）数组中的元素而不改变其余元素的顺序。

- 示例：`nums = [10,9,2,5,3,7,101,18]` → `4`（`[2,3,7,101]`）

**✅ 标准答案**

```js
// tails 数组 + 二分（最优 O(n log n)）
function lengthOfLIS(nums) {
  const tails = []
  for (const x of nums) {
    let l = 0,
      r = tails.length
    while (l < r) {
      const mid = (l + r) >> 1
      if (tails[mid] < x) l = mid + 1
      else r = mid
    }
    tails[l] = x // 替换第一个 >= x 的位置
  }
  return tails.length
}
```

时间复杂度 O(n log n)，空间复杂度 O(n)。

### 最长公共子序列 `#1143`

- **频率**：中高
- **复杂度**：O(mn)
- 🔗 [LeetCode #1143](https://leetcode.cn/problems/longest-common-subsequence/)

**📌 原题**
给定两个字符串 `text1` 和 `text2`，返回这两个字符串的**最长公共子序列**的长度。若没有公共子序列返回 0。

- 示例：`text1 = "abcde", text2 = "ace"` → `3`（`"ace"`）

**✅ 标准答案**

```js
function longestCommonSubsequence(text1, text2) {
  const m = text1.length,
    n = text2.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        text1[i - 1] === text2[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}
```

时间复杂度 O(mn)，空间复杂度 O(mn)（可优化到 O(n)）。

### 编辑距离 `#72`

- **频率**：中高（字符串 DP 经典）
- **复杂度**：O(mn)
- 🔗 [LeetCode #72](https://leetcode.cn/problems/edit-distance/)

**📌 原题**
给你两个单词 `word1` 和 `word2`，请返回将 `word1` 转换成 `word2` 所使用的最少操作数（每次可对某字符进行插入、删除或替换）。

- 示例：`word1 = "horse", word2 = "ros"` → `3`（`horse → rorse(替) → rose(删) → ros(删)`）

**✅ 标准答案**

```js
function minDistance(word1, word2) {
  const m = word1.length,
    n = word2.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (word1[i - 1] === word2[j - 1]) dp[i][j] = dp[i - 1][j - 1]
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
```

时间复杂度 O(mn)，空间复杂度 O(mn)（可优化到 O(n)）。

### 打家劫舍 `#198` / II `#213`

- **频率**：中高
- **复杂度**：O(n)
- 🔗 [LeetCode #198](https://leetcode.cn/problems/house-robber/) / [#213](https://leetcode.cn/problems/house-robber-ii/)

**📌 原题**

- #198：你是一个专业的小偷，计划偷窃沿街的房屋。相邻的房屋装有相互连通的防盗系统，**如果两间相邻的房屋在同一晚上被闯入，系统会自动报警**。给定一个代表每个房屋存放金额的非负整数数组，计算你**不触动警报**的情况下，今晚能够偷窃到的最高金额。
- #213：房子围成一圈（首尾相邻）。

**✅ 标准答案**

```js
function rob(nums) {
  let prev = 0,
    cur = 0
  for (const x of nums) {
    const t = Math.max(cur, prev + x)
    prev = cur
    cur = t
  }
  return cur
}
// #213：拆成 [0,n-2] 与 [1,n-1] 两段取较大
function rob2(nums) {
  if (nums.length === 1) return nums[0]
  const r = (arr) => {
    let p = 0,
      c = 0
    for (const x of arr) {
      const t = Math.max(c, p + x)
      p = c
      c = t
    }
    return c
  }
  return Math.max(r(nums.slice(0, -1)), r(nums.slice(1)))
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 零钱兑换 `#322`

- **频率**：中高（完全背包）
- **复杂度**：O(amount · n)
- 🔗 [LeetCode #322](https://leetcode.cn/problems/coin-change/)

**📌 原题**
给你一个整数数组 `coins` 表示不同面额的硬币，以及一个整数 `amount` 表示总金额。计算并返回可以凑成总金额的**最少的硬币个数**。如果没有任何一种硬币组合能组成总金额，返回 `-1`。

- 示例：`coins = [1,2,5], amount = 11` → `3`（`11 = 5+5+1`）
- 约束：`1 <= coins.length <= 12`，`0 <= amount <= 10^4`。

**✅ 标准答案**

```js
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity)
  dp[0] = 0
  for (let i = 1; i <= amount; i++) {
    for (const c of coins) {
      if (c <= i) dp[i] = Math.min(dp[i], dp[i - c] + 1)
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount]
}
```

时间复杂度 O(amount · n)，空间复杂度 O(amount)。

### 分割等和子集 `#416`

- **频率**：中（0/1 背包变形）
- **复杂度**：O(n · sum/2)
- 🔗 [LeetCode #416](https://leetcode.cn/problems/partition-equal-subset-sum/)

**📌 原题**
给你一个**只包含正整数**的 **非空**数组 `nums`。判断是否可以将这个数组分割成两个子集，使得两个子集的元素和相等。

- 示例：`nums = [1,5,11,5]` → `true`（`[1,5,5]` 与 `[11]`）

**✅ 标准答案**

```js
function canPartition(nums) {
  const sum = nums.reduce((a, b) => a + b, 0)
  if (sum % 2) return false
  const target = sum / 2
  const dp = new Array(target + 1).fill(false)
  dp[0] = true
  for (const num of nums) {
    for (let j = target; j >= num; j--) dp[j] = dp[j] || dp[j - num] // 0/1 背包倒序
  }
  return dp[target]
}
```

时间复杂度 O(n · sum/2)，空间复杂度 O(sum/2)。

### 不同路径 `#62`

- **频率**：中（网格 DP）
- **复杂度**：O(mn)
- 🔗 [LeetCode #62](https://leetcode.cn/problems/unique-paths/)

**📌 原题**
一个机器人位于一个 `m x n` 网格的左上角，机器人每次只能**向下或者向右**移动一步。机器人试图达到网格的右下角，问总共有多少条不同的路径？

- 示例：`m = 3, n = 7` → `28`
- 约束：`1 <= m, n <= 100`。

**✅ 标准答案**

```js
function uniquePaths(m, n) {
  const dp = new Array(n).fill(1) // 第一行/列均为 1
  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) dp[j] += dp[j - 1]
  }
  return dp[n - 1]
}
```

时间复杂度 O(mn)，空间复杂度 O(n)。

### 买卖股票系列 `#121/#122/#123`

- **频率**：高（状态机/动态规划题组）
- **复杂度**：O(n)
- 🔗 [LeetCode #121](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock/) / [#122](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-ii/) / [#123](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-iii/)

**📌 原题**

- #121：只允许**一笔**交易（先买后卖），求最大利润。
- #122：可以**多次**交易（但再次购买前必须卖出），求最大利润。
- #123：最多完成**两笔**交易。
- 示例：`prices = [7,1,5,3,6,4]` → #121 `5`；#122 `7`。

**✅ 标准答案**

```js
// #121 贪心：记录最低买入价
function maxProfit1(prices) {
  let min = Infinity,
    max = 0
  for (const p of prices) {
    min = Math.min(min, p)
    max = Math.max(max, p - min)
  }
  return max
}
// #122 所有上升段累加
function maxProfit2(prices) {
  let profit = 0
  for (let i = 1; i < prices.length; i++)
    if (prices[i] > prices[i - 1]) profit += prices[i] - prices[i - 1]
  return profit
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

---

## 贪心

### 跳跃游戏 / II `#55/#45`

- **频率**：中高（腾讯常考）
- **复杂度**：O(n)
- 🔗 [LeetCode #55](https://leetcode.cn/problems/jump-game/) / [#45](https://leetcode.cn/problems/jump-game-ii/)

**📌 原题**

- #55：给定一个非负整数数组 `nums`，你最初位于数组的**第一个下标**。数组中的每个元素代表你在该位置可以跳跃的最大长度。判断你是否能够到达**最后一个下标**？
- #45：在 #55 可达的前提下，返回到达最后一个下标所需的**最少跳跃次数**。
- 示例：`nums = [2,3,1,1,4]` → #55 `true`；#45 `2`。

**✅ 标准答案**

```js
// #55
function canJump(nums) {
  let farthest = 0
  for (let i = 0; i < nums.length; i++) {
    if (i > farthest) return false // 到不了 i
    farthest = Math.max(farthest, i + nums[i])
  }
  return true
}
// #45 贪心：每次在可达范围内选能跳最远的落点
function jump(nums) {
  let end = 0,
    farthest = 0,
    steps = 0
  for (let i = 0; i < nums.length - 1; i++) {
    farthest = Math.max(farthest, i + nums[i])
    if (i === end) {
      end = farthest
      steps++
    } // 到达当前边界，步数 +1
  }
  return steps
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 加油站 `#134`

- **频率**：中（贪心经典）
- **复杂度**：O(n)
- 🔗 [LeetCode #134](https://leetcode.cn/problems/gas-station/)

**📌 原题**
在一条环路上有 `n` 个加油站，其中第 `i` 个加油站有汽油 `gas[i]`，从第 `i` 个加油站开往第 `i+1` 个加油站需要消耗汽油 `cost[i]`。如果可以绕环路行驶一周，则返回出发时加油站的编号，否则返回 `-1`。

- 示例：`gas = [1,2,3,4,5], cost = [3,4,5,1,2]` → `3`

**✅ 标准答案**

```js
function canCompleteCircuit(gas, cost) {
  let total = 0,
    tank = 0,
    start = 0
  for (let i = 0; i < gas.length; i++) {
    const diff = gas[i] - cost[i]
    total += diff
    tank += diff
    if (tank < 0) {
      start = i + 1
      tank = 0
    } // 一旦为负，从下一站重起
  }
  return total < 0 ? -1 : start
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 分发糖果 `#135`

- **频率**：中（Hard，左右两遍扫描）
- **复杂度**：O(n)
- 🔗 [LeetCode #135](https://leetcode.cn/problems/candy/)

**📌 原题**
`n` 个孩子站成一排，每个孩子有一个评分 `ratings`。你需要按照以下要求给孩子分糖果：每人至少 1 颗；评分更高的孩子比相邻的孩子糖果多。计算最少需要准备的糖果数。

- 示例：`ratings = [1,0,2]` → `5`；`[1,2,2]` → `4`

**✅ 标准答案**

```js
function candy(ratings) {
  const n = ratings.length
  const left = new Array(n).fill(1)
  for (let i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) left[i] = left[i - 1] + 1
  const right = new Array(n).fill(1)
  for (let i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1]) right[i] = right[i + 1] + 1
  let sum = 0
  for (let i = 0; i < n; i++) sum += Math.max(left[i], right[i]) // 取两边较大
  return sum
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 无重叠区间 `#435` / 划分字母区间 `#763`

- **频率**：中（区间贪心）
- 🔗 [LeetCode #435](https://leetcode.cn/problems/non-overlapping-intervals/) / [#763](https://leetcode.cn/problems/partition-labels/)

**📌 原题**

- #435：给定一个区间的集合 `intervals`，找到需要移除区间的**最小数量**，使剩余区间互不重叠。
- #763：字符串 `s` 由小写字母组成，把字符串划分为尽可能多的片段，同一字母最多出现在一个片段中，返回一个表示每个片段长度的列表。
- 示例：`intervals = [[1,2],[2,3],[3,4],[1,3]]` → #435 移除 1 个；`s = "ababcbacadefegdehijhklij"` → #763 `[9,7,8]`。

**✅ 标准答案**

```js
// #435 按结束时间排序，贪心选不重叠
function eraseOverlapIntervals(intervals) {
  intervals.sort((a, b) => a[1] - b[1])
  let end = -Infinity,
    remove = 0
  for (const [s, e] of intervals) {
    if (s >= end)
      end = e // 不重叠则保留
    else remove++ // 重叠则移除
  }
  return remove
}
// #763 记录每个字母最远出现位置
function partitionLabels(s) {
  const last = {}
  for (let i = 0; i < s.length; i++) last[s[i]] = i
  const res = []
  let start = 0,
    end = 0
  for (let i = 0; i < s.length; i++) {
    end = Math.max(end, last[s[i]])
    if (i === end) {
      res.push(end - start + 1)
      start = i + 1
    }
  }
  return res
}
```

时间复杂度 O(n log n) / O(n)，空间复杂度 O(n)。

---

## 二分查找

### 二分查找 `#704` / 查找区间 `#34`

- **频率**：高（#34 中高）
- **复杂度**：O(log n)
- **易错点**：边界模板统一（推荐 `while left < right` + `mid = left + (right-left)/2`）。
- 🔗 [LeetCode #704](https://leetcode.cn/problems/binary-search/) / [#34](https://leetcode.cn/problems/find-first-and-last-position-of-element-in-sorted-array/)

**📌 原题**

- #704：给定一个 `n` 个元素有序（升序）整型数组 `nums` 和一个目标值 `target`，写一个函数搜索 `nums` 中的 `target`，如果目标值存在返回下标，否则返回 `-1`。
- #34：在升序数组中，找出给定目标值 `target` 的**开始位置和结束位置**（若不在返回 `[-1,-1]`）。
- 示例：`nums = [-1,0,3,5,9,12], target = 9` → #704 `4`；`nums = [5,7,7,8,8,10], target=8` → #34 `[3,4]`。

**✅ 标准答案**

```js
function search(nums, target) {
  let l = 0,
    r = nums.length - 1
  while (l <= r) {
    const mid = l + ((r - l) >> 1)
    if (nums[mid] === target) return mid
    else if (nums[mid] < target) l = mid + 1
    else r = mid - 1
  }
  return -1
}
// #34 两次二分找左右边界
function searchRange(nums, target) {
  const left = (arr, t) => {
    let l = 0,
      r = arr.length
    while (l < r) {
      const m = (l + r) >> 1
      if (arr[m] >= t) r = m
      else l = m + 1
    }
    return l
  }
  const a = left(nums, target)
  if (nums[a] !== target) return [-1, -1]
  const b = left(nums, target + 1) - 1
  return [a, b]
}
```

时间复杂度 O(log n)，空间复杂度 O(1)。

### 搜索旋转排序数组 `#33`

- **频率**：高（二分变体经典题）
- **复杂度**：O(log n)
- 🔗 [LeetCode #33](https://leetcode.cn/problems/search-in-rotated-sorted-array/)

**📌 原题**
整数数组 `nums` 按升序排列，数组中的值**互不相同**，并在预先未知的某个下标旋转。给定旋转后的数组 `nums` 和一个整数 `target`，如果 `nums` 中存在目标值 `target` 则返回其下标，否则返回 `-1`。要求 O(log n)。

- 示例：`nums = [4,5,6,7,0,1,2], target = 0` → `4`

**✅ 标准答案**

```js
function search(nums, target) {
  let l = 0,
    r = nums.length - 1
  while (l <= r) {
    const mid = l + ((r - l) >> 1)
    if (nums[mid] === target) return mid
    if (nums[l] <= nums[mid]) {
      // 左半有序
      if (target >= nums[l] && target < nums[mid]) r = mid - 1
      else l = mid + 1
    } else {
      // 右半有序
      if (target > nums[mid] && target <= nums[r]) l = mid + 1
      else r = mid - 1
    }
  }
  return -1
}
```

时间复杂度 O(log n)，空间复杂度 O(1)。

### x 的平方根 `#69`

- **频率**：中（二分答案入门）
- **复杂度**：O(log x)
- 🔗 [LeetCode #69](https://leetcode.cn/problems/sqrtx/)

**📌 原题**
给你一个非负整数 `x`，计算并返回 `x` 的**算术平方根**。由于返回类型是整数，结果只保留**整数部分**，小数部分舍去（向下取整）。

- 示例：`x = 4` → `2`；`x = 8` → `2`（√8 ≈ 2.828）

**✅ 标准答案**

```js
function mySqrt(x) {
  if (x < 2) return x
  let l = 1,
    r = x
  while (l <= r) {
    const mid = l + ((r - l) >> 1)
    if (mid * mid === x) return mid
    else if (mid * mid < x) l = mid + 1
    else r = mid - 1
  }
  return r // 最后一个满足 mid*mid <= x 的值
}
```

时间复杂度 O(log x)，空间复杂度 O(1)。

### 寻找峰值 `#162`

- **频率**：中（局部极值）
- **复杂度**：O(log n)
- 🔗 [LeetCode #162](https://leetcode.cn/problems/find-peak-element/)

**📌 原题**
峰值元素是指其值**严格大于**左右相邻值的元素。给你一个整数数组 `nums`，找到**任意**峰值元素的下标并返回。数组可能包含多个峰值，只需返回其中任一个。

- 示例：`nums = [1,2,3,1]` → `2`；`[1,2,1,3,5,6,4]` → `1` 或 `5`

**✅ 标准答案**

```js
function findPeakElement(nums) {
  let l = 0,
    r = nums.length - 1
  while (l < r) {
    const mid = (l + r) >> 1
    if (nums[mid] < nums[mid + 1])
      l = mid + 1 // 右侧必存在峰值
    else r = mid
  }
  return l
}
```

时间复杂度 O(log n)，空间复杂度 O(1)。

## 前缀和 / 差分

### 区域和检索 - 数组不可变 `#303`

- **频率**：中（前缀和入门）
- **复杂度**：构建 O(n)，查询 O(1)
- 🔗 [LeetCode #303](https://leetcode.cn/problems/range-sum-query-immutable/)

**📌 原题**
给定一个整数数组 `nums`，处理以下类型的多个查询：计算索引 `left` 和 `right`（含）之间的 `nums` 元素的和。实现 `NumArray` 类：`sumRange(left, right)` 返回该区间和。

- 示例：`nums = [-2,0,3,-5,2,-1]`；`sumRange(0,2) -> 1`；`sumRange(2,5) -> -1`

**✅ 标准答案**

```js
class NumArray {
  constructor(nums) {
    this.pre = [0]
    for (let i = 0; i < nums.length; i++) this.pre.push(this.pre[i] + nums[i])
  }
  sumRange(left, right) {
    return this.pre[right + 1] - this.pre[left]
  }
}
```

时间复杂度构建 O(n)、查询 O(1)，空间复杂度 O(n)。

### 和为 K 的子数组 `#560`

- **频率**：中高
- **复杂度**：O(n)
- **易错点**：初始化 `map[0]=1`；负数前缀和也要计数。
- 🔗 [LeetCode #560](https://leetcode.cn/problems/subarray-sum-equals-k/)

**📌 原题**
给你一个整数数组 `nums` 和一个整数 `k`，请你统计并返回该数组中和为 `k` 的**连续子数组**的个数。

- 示例：`nums = [1,1,1], k = 2` → `2`
- 约束：`1 <= nums.length <= 2*10^4`。

**✅ 标准答案**

```js
function subarraySum(nums, k) {
  const map = new Map([[0, 1]]) // 前缀和为 0 出现 1 次（重要）
  let pre = 0,
    count = 0
  for (const n of nums) {
    pre += n
    if (map.has(pre - k)) count += map.get(pre - k)
    map.set(pre, (map.get(pre) || 0) + 1)
  }
  return count
}
```

时间复杂度 O(n)，空间复杂度 O(n)。

### 除自身以外数组的乘积 `#238`

- **频率**：中
- **复杂度**：O(n)
- 🔗 [LeetCode #238](https://leetcode.cn/problems/product-of-array-except-self/)

**📌 原题**
给你一个整数数组 `nums`，返回数组 `answer`，其中 `answer[i]` 等于 `nums` 中除 `nums[i]` 之外其余各元素的乘积。要求 O(n) 时间且不使用除法，空间复杂度 O(1)（不计输出）。

- 示例：`nums = [1,2,3,4]` → `[24,12,8,6]`

**✅ 标准答案**

```js
function productExceptSelf(nums) {
  const n = nums.length,
    res = new Array(n).fill(1)
  let left = 1
  for (let i = 0; i < n; i++) {
    res[i] = left
    left *= nums[i]
  } // 左前缀积
  let right = 1
  for (let i = n - 1; i >= 0; i--) {
    res[i] *= right
    right *= nums[i]
  } // 右后缀积
  return res
}
```

时间复杂度 O(n)，空间复杂度 O(1)（不计输出）。

### 航班预订统计 `#1109`（差分）

- **频率**：中（差分经典）
- **复杂度**：O(n + m)
- 🔗 [LeetCode #1109](https://leetcode.cn/problems/corporate-flight-bookings/)

**📌 原题**
这里有 `n` 个航班，分别从 `1` 到 `n` 编号。有一个航班预订表 `bookings`，其中 `bookings[i] = [firsti, lasti, seatsi]` 表示在从 `firsti` 到 `lasti` 的每个航班上预订了 `seatsi` 个座位。返回一个长度为 `n` 的数组，按航班编号顺序输出每个航班上的总座位数。

- 示例：`bookings = [[1,2,10],[2,3,20],[2,5,25]], n = 5` → `[10,55,45,25,25]`

**✅ 标准答案**

```js
function corpFlightBookings(bookings, n) {
  const diff = new Array(n + 1).fill(0)
  for (const [f, l, s] of bookings) {
    diff[f - 1] += s // 区间起点 +s
    diff[l] -= s // 区间终点后一位 -s
  }
  const res = new Array(n)
  let cur = 0
  for (let i = 0; i < n; i++) {
    cur += diff[i]
    res[i] = cur
  } // 前缀和恢复
  return res
}
```

时间复杂度 O(n + m)，空间复杂度 O(n)。

---

## 位运算

### 只出现一次的数字 `#136` / III `#260`

- **频率**：中高
- **复杂度**：O(n)
- 🔗 [LeetCode #136](https://leetcode.cn/problems/single-number/) / [#260](https://leetcode.cn/problems/single-number-iii/)

**📌 原题**

- #136：除了某个元素只出现一次以外，其余每个元素均出现**两次**。找出那个只出现了一次的元素（要求线性时间、O(1) 空间，不使用额外空间）。
- #260：除两个元素只出现一次外，其余均出现两次。找出这两个元素。
- 示例：`nums = [2,2,1]` → #136 `1`；`[1,2,1,3,2,5]` → #260 `[3,5]`。

**✅ 标准答案**

```js
// #136 全体异或：a^a=0，0^x=x
function singleNumber(nums) {
  let res = 0
  for (const n of nums) res ^= n
  return res
}
// #260 取最低置位 bit 分组再异或
function singleNumberIII(nums) {
  let xor = 0
  for (const n of nums) xor ^= n
  const lowBit = xor & -xor // 最低为 1 的位
  let a = 0,
    b = 0
  for (const n of nums) {
    if (n & lowBit) a ^= n
    else b ^= n
  }
  return [a, b]
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 位 1 的个数 `#191`

- **频率**：中
- **复杂度**：O(1)（32/64 位）
- 🔗 [LeetCode #191](https://leetcode.cn/problems/number-of-1-bits/)

**📌 原题**
编写一个函数，输入是一个无符号整数（以二进制串的形式），返回其二进制表达式中数字位数为 `'1'` 的个数（汉明重量）。

- 示例：`n = 00000000000000000000000000001011`（即 11）→ `3`

**✅ 标准答案**

```js
function hammingWeight(n) {
  let count = 0
  while (n) {
    n &= n - 1
    count++
  } // 每次消去最低位的 1（Brian Kernighan）
  return count
}
```

时间复杂度 O(1)（循环次数 = 1 的个数），空间复杂度 O(1)。

### 2 的幂 `#231` / 两整数之和 `#371`

- **频率**：低—中
- **复杂度**：O(1)
- 🔗 [LeetCode #231](https://leetcode.cn/problems/power-of-two/) / [#371](https://leetcode.cn/problems/sum-of-two-integers/)

**📌 原题**

- #231：给你一个整数 `n`，请判断该整数是否是 **2 的幂次方**（即存在整数 `x` 使 `n == 2^x`）。
- #371：给你两个整数 `a` 和 `b`，**不使用**运算符 `+` 和 `-`，计算并返回两整数之和。
- 示例：`n = 16` → #231 `true`；`a=1,b=2` → #371 `3`。

**✅ 标准答案**

```js
// #231 n>0 且只有一个 1 位
function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0
}
// #371 异或(无进位和) + 与后左移(进位)，循环至无进位
function getSum(a, b) {
  while (b !== 0) {
    const carry = (a & b) << 1
    a = a ^ b
    b = carry
  }
  return a
}
```

时间复杂度 O(1)，空间复杂度 O(1)。

---

## 并查集

### 冗余连接 `#684`

- **频率**：中（并查集判定环）
- **复杂度**：O(n α(n))
- 🔗 [LeetCode #684](https://leetcode.cn/problems/redundant-connection/)

**📌 原题**
树可以看成是一个连通且**无环**的**无向**图。给定一个有 `n` 个节点（标号 `1` 到 `n`）的图，该图由 `n` 条边组成（`edges` 中每条边连接两个节点）。请找出一条可以删去的边，使得删除后剩余部分是一个有着 `n` 个节点的树。若有多个答案，返回 `edges` 中**最后出现的**那条边。

- 示例：`edges = [[1,2],[1,3],[2,3]]` → `[2,3]`

**✅ 标准答案**

```js
function findRedundantConnection(edges) {
  const parent = []
  const find = (x) => {
    if (parent[x] === undefined) parent[x] = x
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    } // 路径压缩
    return x
  }
  for (const [u, v] of edges) {
    const ru = find(u),
      rv = find(v)
    if (ru === rv) return [u, v] // 已同集合，说明成环，该边冗余
    parent[ru] = rv
  }
  return []
}
```

时间复杂度 O(n α(n))，空间复杂度 O(n)。

### 朋友圈 / 省份数量 `#547`

- **频率**：中
- **复杂度**：O(n² α(n))
- **易错点**：路径压缩 + 按秩合并是面试追问点。
- 🔗 [LeetCode #547](https://leetcode.cn/problems/number-of-provinces/)

**📌 原题**
有 `n` 个城市，其中一些彼此相连，相连的城市直接或间接形成一个"省份"。给你一个 `n x n` 的矩阵 `isConnected`，其中 `isConnected[i][j] = 1` 表示第 `i` 个城市和第 `j` 个城市直接相连。返回矩阵中**省份**的数量。

- 示例：`isConnected = [[1,1,0],[1,1,0],[0,0,1]]` → `2`

**✅ 标准答案**

```js
function findCircleNum(isConnected) {
  const n = isConnected.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isConnected[i][j]) {
        const ri = find(i),
          rj = find(j)
        if (ri !== rj) parent[ri] = rj
      }
    }
  }
  let count = 0
  for (let i = 0; i < n; i++) if (find(i) === i) count++ // 根节点数 = 集合数
  return count
}
```

时间复杂度 O(n² α(n))，空间复杂度 O(n)。

> 岛屿数量并查集解法见「图」#200，与 DFS/BFS 对比是加分项。

---

## 排序手写（快排 / 归并 / 堆排）

### 手撕快速排序 `#912`

- **频率**：高（CodeTop 排序类第一）
- **复杂度**：平均 O(n log n)，最坏 O(n²)
- **易错点**：pivot 选择影响退化；partition 边界与等于 pivot 的处理。
- 🔗 [LeetCode #912](https://leetcode.cn/problems/sort-an-array/)

**📌 原题**
给你一个整数数组 `nums`，请将该数组升序排列（要求手写排序算法，不准调用内置 `sort`）。

- 示例：`nums = [5,2,3,1]` → `[1,2,3,5]`
- 约束：`1 <= nums.length <= 5*10^4`。

**✅ 标准答案**

```js
function sortArray(nums) {
  const quick = (arr, l, r) => {
    if (l >= r) return
    const pivot = arr[r]
    let i = l
    for (let j = l; j < r; j++) {
      if (arr[j] < pivot) {
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
        i++
      }
    }
    ;[arr[i], arr[r]] = [arr[r], arr[i]] // pivot 归位
    quick(arr, l, i - 1)
    quick(arr, i + 1, r)
  }
  quick(nums, 0, nums.length - 1)
  return nums
}
```

时间复杂度平均 O(n log n)、最坏 O(n²)，空间复杂度 O(log n)（递归栈）。

### 手撕归并排序 `#912` / 排序链表 `#148`

- **频率**：高（链表排序几乎必写归并）
- **复杂度**：O(n log n)，稳定
- **易错点**：链表版需 `slow.next = null` 断开；merge 用 dummy 节点。
- 🔗 [LeetCode #912](https://leetcode.cn/problems/sort-an-array/) / [#148](https://leetcode.cn/problems/sort-list/)

**📌 原题**

- #912：数组归并排序（升序）。
- #148：给你链表的头节点 `head`，将其按**升序**排列并返回排序后的链表，要求 O(n log n) 时间、O(1) 空间（自顶向下归并）。

**✅ 标准答案**

```js
// 数组归并
function mergeSort(arr) {
  if (arr.length <= 1) return arr
  const mid = arr.length >> 1
  const left = mergeSort(arr.slice(0, mid))
  const right = mergeSort(arr.slice(mid))
  const res = []
  let i = 0,
    j = 0
  while (i < left.length && j < right.length) res.push(left[i] <= right[j] ? left[i++] : right[j++])
  return res.concat(left.slice(i), right.slice(j))
}
// 链表归并（自顶向下）
function sortList(head) {
  if (!head || !head.next) return head
  let slow = head,
    fast = head,
    prev = null
  while (fast && fast.next) {
    prev = slow
    slow = slow.next
    fast = fast.next.next
  }
  prev.next = null // 断开成两半
  const l = sortList(head),
    r = sortList(slow)
  const dummy = new ListNode(0)
  let cur = dummy
  while (l && r) {
    if (l.val <= r.val) {
      cur.next = l
      l = l.next
    } else {
      cur.next = r
      r = r.next
    }
    cur = cur.next
  }
  cur.next = l || r
  return dummy.next
}
```

时间复杂度 O(n log n)，空间复杂度数组 O(n)、链表 O(1)（递归栈 O(log n)）。

### 手撕堆排序 `#912`

- **频率**：中（考察建堆 + 下沉）
- **复杂度**：O(n log n)，原地
- **易错点**：建堆从最后一个非叶子节点 `n/2-1` 开始下沉。
- 🔗 [LeetCode #912](https://leetcode.cn/problems/sort-an-array/)

**📌 原题**
数组升序排序，要求手写**堆排序**（1. 自底向上建大顶堆；2. 反复把堆顶与末尾交换后下沉）。

- 示例：`nums = [5,2,3,1]` → `[1,2,3,5]`

**✅ 标准答案**

```js
function heapSort(nums) {
  const n = nums.length
  const sink = (i, size) => {
    while (true) {
      let largest = i,
        l = 2 * i + 1,
        r = 2 * i + 2
      if (l < size && nums[l] > nums[largest]) largest = l
      if (r < size && nums[r] > nums[largest]) largest = r
      if (largest === i) break
      ;[nums[i], nums[largest]] = [nums[largest], nums[i]]
      i = largest
    }
  }
  for (let i = (n >> 1) - 1; i >= 0; i--) sink(i, n) // 建大顶堆
  for (let i = n - 1; i > 0; i--) {
    ;[nums[0], nums[i]] = [nums[i], nums[0]] // 堆顶放末尾
    sink(0, i) // 下沉调整
  }
  return nums
}
```

时间复杂度 O(n log n)，空间复杂度 O(1)（原地）。

---

## 高频设计题

### LRU 缓存 `#146`

- **频率**：高（缓存设计经典题）
- **复杂度**：O(1)
- **易错点**：务必手写双向链表（或 Map 保序）；解释淘汰策略与线程安全扩展。
- 🔗 [LeetCode #146](https://leetcode.cn/problems/lru-cache/)

**📌 原题**
运用你所掌握的数据结构，设计和实现一个 **LRU（最近最少使用）缓存机制**。实现 `LRUCache` 类：`get(key)` 若 key 存在则返回其值（否则 -1），`put(key, value)` 若 key 存在则变更值；若容量满则**淘汰最久未使用**的 key。要求 `get`/`put` 均为 O(1)。

- 示例：`capacity = 2; put(1,1); put(2,2); get(1)->1; put(3,3) 淘汰 2; get(2)->-1`

**✅ 标准答案**

```js
class LRUCache {
  constructor(capacity) {
    this.cap = capacity
    this.map = new Map() // JS 的 Map 保持插入顺序：最近使用放末尾
  }
  get(key) {
    if (!this.map.has(key)) return -1
    const v = this.map.get(key)
    this.map.delete(key)
    this.map.set(key, v) // 移到末尾 = 最近使用
    return v
  }
  put(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.cap) {
      this.map.delete(this.map.keys().next().value) // 删最旧（表头）
    }
  }
}
```

时间复杂度 O(1)，空间复杂度 O(cap)。

### LFU 缓存 `#460`

- **频率**：中（Hard，进阶设计）
- **复杂度**：O(1)
- **易错点**：同频淘汰最久未用；维护 `minFreq` 是关键。
- 🔗 [LeetCode #460](https://leetcode.cn/problems/lfu-cache/)

**📌 原题**
设计并实现 **LFU（最不经常使用）缓存**数据结构。要求 `get`/`put` 都是 O(1) 时间复杂度。在容量满时，淘汰**使用频率最低**的 key；若有多个同频 key，淘汰最久未使用的。

- 示例：`capacity=2; put(1,1); put(2,2); get(1); put(3,3) 淘汰 2（2 频 1，1 频 2）; get(2)->-1`

**✅ 标准答案**

```js
class LFUCache {
  constructor(capacity) {
    this.cap = capacity
    this.keyMap = new Map() // key -> { value, freq }
    this.freqMap = new Map() // freq -> 按序存放的 key 数组（Linked-list 思想）
    this.minFreq = 0
  }
  get(key) {
    if (!this.keyMap.has(key)) return -1
    this._incrFreq(key)
    return this.keyMap.get(key).value
  }
  put(key, value) {
    if (this.cap === 0) return
    if (this.keyMap.has(key)) {
      this.keyMap.get(key).value = value
      this._incrFreq(key)
      return
    }
    if (this.keyMap.size === this.cap) {
      const keys = this.freqMap.get(this.minFreq)
      const evict = keys.shift() // 淘汰该频下最久未用（队首）
      if (!keys.length) this.freqMap.delete(this.minFreq)
      this.keyMap.delete(evict)
    }
    this.keyMap.set(key, { value, freq: 1 })
    if (!this.freqMap.has(1)) this.freqMap.set(1, [])
    this.freqMap.get(1).push(key)
    this.minFreq = 1
  }
  _incrFreq(key) {
    const node = this.keyMap.get(key)
    const old = node.freq
    const arr = this.freqMap.get(old)
    arr.splice(arr.indexOf(key), 1)
    if (!arr.length) {
      this.freqMap.delete(old)
      if (this.minFreq === old) this.minFreq = old + 1
    }
    node.freq++
    if (!this.freqMap.has(node.freq)) this.freqMap.set(node.freq, [])
    this.freqMap.get(node.freq).push(key)
  }
}
```

时间复杂度 O(1)，空间复杂度 O(cap)。

### 实现 Trie（前缀树）`#208`

- **频率**：中（字符串高频设计）
- **复杂度**：插入/查找 O(|word|)
- 🔗 [LeetCode #208](https://leetcode.cn/problems/implement-trie-prefix-tree/)

**📌 原题**
实现一个 Trie（前缀树），包含以下操作：`insert(word)` 插入；`search(word)` 查找该**完整**单词是否存在；`startsWith(prefix)` 查找是否有以 `prefix` 为前缀的单词。

- 示例：`insert("apple"); search("apple")->true; search("app")->false; startsWith("app")->true`

**✅ 标准答案**

```js
class TrieNode {
  constructor() {
    this.children = {}
    this.isEnd = false
  }
}
class Trie {
  constructor() {
    this.root = new TrieNode()
  }
  insert(word) {
    let node = this.root
    for (const c of word) {
      if (!node.children[c]) node.children[c] = new TrieNode()
      node = node.children[c]
    }
    node.isEnd = true
  }
  search(word) {
    let node = this.root
    for (const c of word) {
      if (!node.children[c]) return false
      node = node.children[c]
    }
    return node.isEnd
  }
  startsWith(prefix) {
    let node = this.root
    for (const c of prefix) {
      if (!node.children[c]) return false
      node = node.children[c]
    }
    return true
  }
}
```

时间复杂度 O(|word|)，空间复杂度 O(总字符数)。

### 缺失的第一个正数 `#41`

- **频率**：中（Hard，原地哈希思想）
- **复杂度**：O(n)
- 🔗 [LeetCode #41](https://leetcode.cn/problems/first-missing-positive/)

**📌 原题**
给你一个未排序的整数数组 `nums`，请你找出其中没有出现的最小的**正整数**。要求实现时间复杂度 O(n)、仅使用常数级别额外空间。

- 示例：`nums = [1,2,0]` → `3`；`[3,4,-1,1]` → `2`
- 约束：`1 <= nums.length <= 5*10^5`。

**✅ 标准答案**

```js
function firstMissingPositive(nums) {
  const n = nums.length
  for (let i = 0; i < n; i++) {
    while (nums[i] > 0 && nums[i] <= n && nums[nums[i] - 1] !== nums[i]) {
      const t = nums[i] - 1 // 把值 v 归位到下标 v-1
      ;[nums[i], nums[t]] = [nums[t], nums[i]]
    }
  }
  for (let i = 0; i < n; i++) if (nums[i] !== i + 1) return i + 1 // 第一个错位
  return n + 1
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

### 多数元素 `#169`

- **频率**：中（摩尔投票法）
- **复杂度**：O(n)
- 🔗 [LeetCode #169](https://leetcode.cn/problems/majority-element/)

**📌 原题**
给定一个大小为 `n` 的数组 `nums`，返回其中的**多数元素**。多数元素是指在数组中出现次数**大于** `⌊n/2⌋` 的元素（假设一定存在）。

- 示例：`nums = [3,2,3]` → `3`；`[2,2,1,1,1,2,2]` → `2`
- 约束：`n == nums.length`，`1 <= n <= 5*10^4`。

**✅ 标准答案**

```js
function majorityElement(nums) {
  let candidate = nums[0],
    count = 0
  for (const n of nums) {
    if (count === 0) candidate = n // 计数归零则换候选
    count += n === candidate ? 1 : -1 // 抵消不同元素
  }
  return candidate
}
```

时间复杂度 O(n)，空间复杂度 O(1)。

> 建议以 LeetCode 热题 100 + 面试经典 150 为骨架，配合 CodeTop 按目标公司筛选近一年真题；每类题至少掌握「递归/迭代」或「双指针/单调栈」两种思路，并熟练口述复杂度与边界。

## 参考来源 / 延伸阅读

- LeetCode 力扣（含热题 100 / 面试 150 学习计划）：[leetcode.cn](https://leetcode.cn/)
- CodeTop（按公司筛选近一年真题）：[codetop.cc](https://codetop.cc/)
- 牛客网（校招 / 社招笔面经）：[nowcoder.com](https://www.nowcoder.com/)
- VisualGo（算法可视化，理解过程）：[visualgo.net](https://visualgo.net/zh)
- 《算法导论》（CLRS，复杂度与经典算法理论）
