---
group: 数据与缓存
order: 2
---

# Redis 缓存实战

> VueChestServer 这类 Node 后端，Redis 是性能与体验的关键一环：缓存热点、存会话、限流。本文讲清数据结构选型、三大经典问题与解法，以及与 MySQL（见 `mysql-optimization.md`）的协作，补全面试/工程视角。

## 一、为什么用 Redis

Redis 是以内存数据结构为核心的服务，单次简单命令通常延迟很低，但网络、持久化、数据结构大小、慢命令和高并发都会改变实际结果。它适合缓存、会话、排行榜、计数、限流和协调；是否比数据库快多少必须按部署与访问模式测量。

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

Cache-Aside 仍不是强一致：读请求可能在写事务提交前查到旧值，并在提交/删缓存后把旧值回填。可按业务容忍度使用版本号/条件写、短 TTL、延迟双删、消息驱动失效或直接绕过缓存读取权威库。先定义允许陈旧多久，再选复杂度。

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

// 固定窗口限流：MULTI 保证 INCR 与首次 EXPIRE 一起提交
const key = `ratelimit:${principalId}:${Math.floor(Date.now() / 60_000)}`
const [[, cnt]] = await redis.multi().incr(key).expire(key, 70, 'NX').exec()
if (cnt > 100) throw new Error('too many requests')
```

这仍是固定窗口，不是滑动窗口；边界瞬间可能允许两倍流量。需要更平滑时使用令牌桶、漏桶或 ZSet/Lua 滑动窗口，并把“判断 + 更新 + 过期”放在一个原子脚本中。按 IP 限流会误伤 NAT 用户，通常还需账号、API key、租户和全局容量维度。

## 六、与 VueChest 的衔接

- **登录态/验证码**：匿名邮箱验证码目前是内存 `Map`（见项目约定），多实例部署时应迁 Redis 保证一致性。
- **R2/DB 凭证**：敏感配置不进 Redis 明文，走环境变量/密钥管理。
- **接口缓存**：市场 app 列表、热帖等可缓存短 TTL，降 MySQL 压力。

## 七、键、TTL 与内存治理

键名建议包含环境、业务、tenant 和 schema version，例如 `prod:market:v2:app:123`，但不要把邮箱、手机号或 token 直接放进 key。批量读取优先 pipeline/MGET，避免 N 次网络往返；禁止在线使用 `KEYS *`，扫描治理使用 `SCAN` 并限制频率。

TTL 加随机抖动要设合理上下界，不能让安全凭证意外延长。选择淘汰策略前区分“纯缓存”和“不可丢状态”：会话、幂等记录和任务状态若与普通缓存共享一个会淘汰的实例，内存压力可能破坏正确性。

大 key 和热 key 会阻塞单线程命令执行或让集群负载倾斜。监控 key size、slowlog、命中率、eviction、内存碎片、连接数与单分片 QPS；Hash/List/Set 的复杂度取决于元素数量，不能只因为命令名简单就忽略上限。

## 八、持久化、高可用与故障语义

RDB、AOF、复制、Sentinel/Cluster 分别解决不同问题，复制不等于备份，故障切换也可能丢失尚未复制的写。若 Redis 只做可重建缓存，可在故障时限流后绕过；若承担 session、余额预留或幂等键，就必须明确 RPO/RTO、持久化和故障降级。

分布式锁至少要使用唯一 token 与带条件的原子释放，并设置租约；长任务需要续租与 fencing token，防止旧持有者在暂停后恢复继续写。不要用简单 `SETNX` + `DEL` 就宣称获得强互斥，更不能让锁替代数据库唯一约束或事务。

Redis Cluster 只保证同一 hash slot 的多键原子操作；Lua/MULTI 涉及多 key 时用 hash tag 或重构数据模型。故障切换、重分片和客户端重试下仍需业务幂等。

## 九、常见坑

- **把删除缓存当强一致**：并发旧读回填仍可能制造短暂脏值。
- **`INCR` 与 `EXPIRE` 分两次发**：进程在中间失败会留下永不过期计数。
- **缓存 `null` 不区分版本**：数据后来创建，旧空值仍阻止读取。
- **无上限 value 或集合**：大 key 阻塞、迁移慢并放大网络流量。
- **会话与普通缓存混用淘汰策略**：压力下用户随机掉线。
- **击穿时所有请求等待同一锁**：锁持有者失败造成延迟堆积，应有超时和陈旧兜底。
- **把 Pub/Sub 当可靠队列**：离线订阅者收不到历史消息，需要可靠消费时评估 Streams/消息队列。

## 十、架构决策清单

- [ ] 数据能否重建、允许陈旧多久，缓存失败时是降级还是失败？
- [ ] key、value、TTL、空值和 schema version 是否有统一规范？
- [ ] Cache-Aside 并发竞态是否用真实测试验证，强一致数据是否绕过缓存？
- [ ] 限流算法与维度是否匹配业务，判断和更新是否原子？
- [ ] session、幂等记录、队列状态是否与可淘汰缓存隔离？
- [ ] 是否监控 hit ratio、eviction、slowlog、大/热 key、复制与内存水位？
- [ ] 故障切换、连接风暴、缓存雪崩与数据库保护是否演练？
- [ ] 分布式锁是否真的必要，并有唯一 token、租约、fencing 与业务幂等？

## 十一、小结

- 数据结构按场景选：计数 String、对象 Hash、排行 ZSet。
- Cache-Aside：先更新 DB 再删缓存，缩不一致窗口。
- 穿透（布隆/空值）、击穿（锁/逻辑过期）、雪崩（抖动/高可用）三件套必会。
- 会话、限流、排行榜是 Redis 的拿手好戏。

## 参考来源

- Redis 官方文档：<https://redis.io/docs/latest/>
- 布隆过滤器：<https://redis.io/docs/latest/develop/data-types/probabilistic/bloom-filter/>
- Redis persistence：<https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/>
- Redis distributed locks：<https://redis.io/docs/latest/develop/use/patterns/distributed-locks/>
