---
group: 数据与缓存
order: 1
---

# 数据库与 MySQL 优化

> 适用场景：后端接口变慢、列表卡顿、慢查询告警。本文讲索引原理、最左前缀、事务隔离、慢查询与分页优化，对应 VueChestServer（Express + MySQL + Sequelize）。
> 阅读前提：SQL 基础、Node 后端（见 `node-backend`）。

大多数「接口慢」最终都指向数据库——要么没走索引，要么查太多、锁太久。理解下面的机制，能定位八成以上的慢查询。

## 一、索引与 B+ 树

- InnoDB 的常规索引使用 **B+ 树**：叶子页有序，适合等值和范围访问。实际耗时还受 Buffer Pool 命中、页分裂、回表、扫描行数和存储影响，不能把树高直接等同于固定磁盘 IO 次数。
- **聚簇索引（主键）**：叶子节点直接存整行数据；**二级索引**叶子存「主键值」，回表再取完整行。
- 索引可显著缩小候选范围，但低选择性条件、返回大部分行或统计信息错误时，全表扫描反而可能更便宜。

```sql
-- 给高频查询条件加索引
ALTER TABLE market_apps ADD INDEX idx_uploadedby (uploadedby);
```

## 二、最左前缀原则

联合索引 `(a, b, c)` 像「字典排序」，查询必须从最左列开始才命中：

```sql
-- 命中：用到 a、a+b、a+b+c
WHERE a = 1 AND b = 2
-- 无法使用该联合索引的最左查找能力（缺 a）：
WHERE b = 2
-- b 用于索引范围；c 通常不能继续缩小该范围，但可能由索引条件下推过滤：
WHERE a = 1 AND b > 10 AND c = 3
```

> 联合索引顺序应匹配真实的等值、范围、排序与覆盖需求，不能只按“区分度最高放最左”一条经验决定。函数索引是否可用取决于版本和显式表达式索引；普通索引下将 `YEAR(created_at)=2026` 改为时间范围通常更直接。

## 三、事务与隔离级别

- 事务 ACID；MySQL 默认隔离级别 **REPEATABLE READ**（可重复读）。
- 常见问题：**脏读 / 不可重复读 / 幻读**。RR 解决前两者，靠 MVCC + 间隙锁缓解幻读。
- 长事务是性能杀手：持有锁久、undo 日志膨胀、主从延迟。尽量「短事务、快提交」。

> VueChestServer 的 `uploads.js` / `market.js` 用事务保证「应用文件上传 + 市场记录 upsert」原子（见项目约定：改这两文件后先重启再 publish）。

## 四、慢查询排查

```sql
-- 开启慢查询日志（阈值 1 秒）
SET long_query_time = 1;
-- 用 EXPLAIN 看执行计划
EXPLAIN SELECT * FROM market_apps WHERE uploadedby = 5 ORDER BY id DESC LIMIT 20;
```

看 `EXPLAIN` 关键列：

- `type`：描述访问方式，`ALL` 是全表扫描、`const/ref/range` 等是不同索引访问；不能脱离估算行数和真实耗时只按枚举排名。
- `key`：实际用了哪个索引（NULL = 没走索引）。
- `rows`：估算扫描行数，越大越慢。
- `Extra`：`Using filesort` / `Using temporary` 提示需优化排序/分组。

## 五、分页优化（深分页坑）

```sql
-- ❌ 深分页：OFFSET 越大越慢（要扫过前面所有行）
SELECT * FROM market_apps ORDER BY id DESC LIMIT 20 OFFSET 100000;
-- ✅ 游标分页：用上一页最后 id 接着查，走索引
SELECT * FROM market_apps WHERE id < :lastId ORDER BY id DESC LIMIT 20;
```

游标分页要求排序稳定且游标包含全部排序键。例如按 `created_at DESC, id DESC` 排序时，下一页条件也要比较二元组，避免同一时间戳下漏项或重复。需要随机跳到第 N 页时仍可能使用 OFFSET 或预计算定位点，取舍取决于产品需求。

## 六、其他高频优化

- **只查需要的列**：`SELECT id, name` 而非 `SELECT *`，减少 IO 与回表。
- **避免 SELECT 大字段**：文本/JSON 单独表或懒加载。
- **JOIN 走索引**：关联字段要有索引，小表驱动大表。
- **N+1 查询**：ORM 循环查关联（见 `node-backend`），用 `include`/`JOIN` 预加载。
- **连接池**：后端用连接池复用连接，避免频繁建连。
- **读写分离 / 缓存**：热点读走缓存（Redis），写落库。

## 七、与 Sequelize 的对应

```js
// 模型定义里声明索引
MarketApp.init(
  {
    /* ... */
  },
  {
    sequelize,
    indexes: [{ fields: ['uploadedby'] }, { fields: ['uploadedby', 'name'] }],
  },
)
// 预加载避免 N+1
await MarketApp.findAll({ include: [{ model: User, as: 'author' }] })
```

> `DELETE` 不会像 `TRUNCATE` 那样重置自增计数。需要调整时应在受控维护窗口确认 `MAX(id)`、并发写入与目标值后执行 `ALTER TABLE ... AUTO_INCREMENT = ...`。不要用“事务插入再回滚”探针猜下一个 ID：自增值通常不会因事务回滚而回收，探针本身会消耗编号。业务也不应依赖自增 ID 连续无空洞。

## 八、索引设计与写入成本

一个查询的理想联合索引通常从等值过滤开始，接范围/排序列，必要时把少量返回列纳入覆盖索引。设计前统计查询频率、返回比例、排序、锁范围与写入成本：

- 每个二级索引都会增加 INSERT/UPDATE/DELETE、Buffer Pool 和磁盘占用。
- 随机大主键会增加聚簇页分裂并让所有二级索引叶子更大。
- `SELECT *` 让覆盖索引失效，也增加网络和对象构造成本。
- 前缀索引节省空间但可能降低选择性，需通过实际分布计算。
- 重复/被包含索引增加维护成本，删除前检查慢日志和线上使用情况。

统计信息影响优化器估算。执行计划突然变差时检查数据分布、统计信息、参数值和 schema 变化，不要第一反应强制 index hint；hint 会冻结今天的假设。

## 九、锁、死锁与并发控制

InnoDB 死锁并不等于数据库坏了：检测到循环后会回滚其中一个事务，应用需要对可重试事务做有限退避重试。减少死锁的方法是统一访问顺序、缩短事务、命中索引以缩小锁范围，并避免在事务内调用慢外部 API。

更新关键状态时可用乐观版本条件：

```sql
UPDATE orders
SET status = :next_status, version = version + 1
WHERE id = :id AND version = :expected_version;
```

影响行数为 0 表示并发冲突或记录不存在，应用应重新读取/提示，而不是无条件覆盖。`SELECT ... FOR UPDATE` 适合需要悲观锁的短事务，但索引不当可能锁住比预期更多范围。

## 十、从慢日志到 EXPLAIN ANALYZE

排障顺序：确认接口 trace → 找到 SQL 与参数模式 → 看慢日志/Performance Schema → `EXPLAIN` 估算 → 在安全环境用 `EXPLAIN ANALYZE` 获取实际行数和耗时 → 改索引/SQL → 回放与上线观察。

`EXPLAIN ANALYZE` 会真正执行查询，不能对未知代价的写操作或繁忙生产随意运行。优化后不仅看单次毫秒数，还看 rows examined、返回行、Buffer Pool、临时表、排序、锁等待和 P95/P99。数据库快但 ORM 传输/序列化很慢，也不是索引能解决的问题。

## 十一、常见坑

- **给每个字段都建单列索引**：不一定满足组合过滤/排序，写放大明显。
- **只看 `key` 不看扫描行数**：用了索引也可能扫描大部分索引。
- **深分页改成单 ID 游标**：排序键不唯一时仍会漏项/重复。
- **长事务里做网络调用**：锁和 undo 长时间占用，故障重试更危险。
- **把读写分离当即时一致**：副本延迟会让写后读拿旧值。
- **ORM include 无上限**：一个 JOIN 形成笛卡尔放大或载入海量对象。
- **用自增连续性表达业务正确性**：回滚、失败和并发都会留下空洞。

## 十二、优化决策清单

- [ ] 是否从真实慢日志和 trace 找到高频/高代价 SQL，而非凭感觉加索引？
- [ ] 联合索引是否同时考虑等值、范围、排序、覆盖与写成本？
- [ ] `EXPLAIN` 估算与安全环境实际执行行数是否一致？
- [ ] 分页排序是否稳定，游标是否包含全部排序键和方向？
- [ ] 事务是否短小、访问顺序一致，并对死锁做有限幂等重试？
- [ ] 连接池上限是否与数据库容量和服务实例数共同计算？
- [ ] schema/index 变更是否评估在线 DDL、复制延迟、磁盘与回滚？
- [ ] 优化后是否同时验证正确性、P95/P99、锁等待和资源水位？

## 十三、面试速记

| 主题     | 必会                          |
| -------- | ----------------------------- |
| 索引     | B+树、聚簇/二级、回表         |
| 最左前缀 | 联合索引从左用起、范围后失效  |
| 事务     | ACID、隔离级别、长事务危害    |
| 排查     | EXPLAIN、type/key/rows/Extra  |
| 分页     | 深 OFFSET 慢 → 游标分页       |
| 设计     | 只查所需列、JOIN 索引、连接池 |

## 参考来源

- MySQL 官方文档：<https://dev.mysql.com/doc/>
- 《高性能 MySQL》（Baron Schwartz 等）
- EXPLAIN 详解：<https://dev.mysql.com/doc/refman/8.0/en/explain-output.html>
- Sequelize 模型与索引：<https://sequelize.org/docs/>
