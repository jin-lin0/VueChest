---
group: 数据与缓存
order: 2
---

# Redis 缓存实战

> VueChestServer 这类 Node 后端，Redis 是性能与体验的关键一环：缓存热点、存会话、限流。本文讲清数据结构选型、三大经典问题与解法，以及与 MySQL（见 `mysql-optimization.md`）的协作，补全面试/工程视角。

## 一、为什么用 Redis

Redis 是内存 KV 数据库，读写微秒级，比 MySQL 快几个数量级。典型用途：缓存、会话（Session）、排行榜（ZSet）、限流、发布订阅、分布式锁。

## 二、核心数据结构与选型

| 结构                   | 命令示例              | 场景                     |
| ---------------------- | --------------------- | ------------------------ |
| **String**             | `SET/GET/INCR/EXPIRE` | 计数器、验证码、简单缓存 |
| **Hash**               | `HSET/HGET/HMGET`     | 对象（用户资料）部分更新 |
| **List**               | `LPUSH/LRANGE`        | 队列、最新列表           |
| **Set**                | `SADD/SISMEMBER`      | 标签、去重、共同关注     |
| **ZSet（有序集合）**   | `ZADD/ZRANGE`         | 排行榜、延迟队列         |
| **Bitmap/HyperLogLog** | `SETBIT/PFADD`        | 签到、UV 去重估算        |

## 三、缓存与 MySQL 的读写协作

标准 **Cache-Aside（旁路缓存）** 模式：

```text
读：先查 Redis → 命中返回；未命中查 MySQL → 写入 Redis → 返回
写：更新 MySQL → 删除（或更新）Redis 对应键（先更新库再删缓存）
```

> 为什么"删"而非"更新"缓存？更新缓存有并发竞争（A 写库、B 写库、B 写缓存、A 写缓存 → 缓存是旧值）。删缓存把不一致窗口缩到最小，下次读自然回填。

## 四、三大经典问题

### 1. 缓存穿透（查不存在的数据）

恶意/误查永远不在 DB 的 key，绕过缓存直击 DB。

- **布隆过滤器**：拦截不存在的 key。
- **空值缓存**：查不到也缓存 `null`（短 TTL），防反复打 DB。

### 2. 缓存击穿（热点 key 失效瞬间）

某热点 key 过期瞬间，大量并发同时击穿到 DB。

- **互斥锁（mutex）**：只放一个请求重建缓存，其余等待。
- **逻辑过期**：不设物理 TTL，值里带过期时间，异步重建。
- **热点 key 不过期**：后台刷新。

### 3. 缓存雪崩（大量 key 同时失效）

同批次 key 集中过期 / Redis 宕机 → DB 被冲垮。

- **过期时间加随机抖动**：避免同时失效。
- **多级缓存**：本地缓存（Memory）挡一层。
- **高可用**：Redis 哨兵/集群，防单点。

## 五、会话与限流

```js
// 验证码/会话：带过期
await redis.set(`code:${phone}`, code, 'EX', 300) // 5 分钟

// 限流：滑动窗口（INCR + EXPIRE）
const cnt = await redis.incr(`ratelimit:${ip}`)
if (cnt === 1) await redis.expire(`ratelimit:${ip}`, 60)
if (cnt > 100) throw new Error('too many requests')
```

## 六、与 VueChest 的衔接

- **登录态/验证码**：匿名邮箱验证码目前是内存 `Map`（见项目约定），多实例部署时应迁 Redis 保证一致性。
- **R2/DB 凭证**：敏感配置不进 Redis 明文，走环境变量/密钥管理。
- **接口缓存**：市场 app 列表、热帖等可缓存短 TTL，降 MySQL 压力。

## 七、小结

- 数据结构按场景选：计数 String、对象 Hash、排行 ZSet。
- Cache-Aside：先更新 DB 再删缓存，缩不一致窗口。
- 穿透（布隆/空值）、击穿（锁/逻辑过期）、雪崩（抖动/高可用）三件套必会。
- 会话、限流、排行榜是 Redis 的拿手好戏。

## 参考来源

- Redis 官方文档：<https://redis.io/docs/latest/>
- 美团技术团队《Redis 缓存击穿/穿透/雪崩》：<https://tech.meituan.com/>
- 布隆过滤器：<https://redis.io/docs/latest/develop/data-types/probabilistic/bloom-filter/>
