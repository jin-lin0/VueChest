---
group: 后端与基础设施
order: 52
---

# 数据库与 MySQL 优化

> 适用场景：后端接口变慢、列表卡顿、慢查询告警。本文讲索引原理、最左前缀、事务隔离、慢查询与分页优化，对应 VueChestServer（Express + MySQL + Sequelize）。
> 阅读前提：SQL 基础、Node 后端（见 `node-backend`）。

大多数「接口慢」最终都指向数据库——要么没走索引，要么查太多、锁太久。理解下面的机制，能定位八成以上的慢查询。

## 一、索引与 B+ 树

- InnoDB 用 **B+ 树** 存索引：所有数据在叶子节点、且有序，范围查询极快；树高通常 3–4 层，一次查询只需 3–4 次磁盘 IO。
- **聚簇索引（主键）**：叶子节点直接存整行数据；**二级索引**叶子存「主键值」，回表再取完整行。
- 索引让「按条件查」从全表扫描（O(n)）变成树查找（O(log n)）。

```sql
-- 给高频查询条件加索引
ALTER TABLE market_apps ADD INDEX idx_uploadedby (uploadedby);
```

## 二、最左前缀原则

联合索引 `(a, b, c)` 像「字典排序」，查询必须从最左列开始才命中：

```sql
-- 命中：用到 a、a+b、a+b+c
WHERE a = 1 AND b = 2
-- 不命中（缺最左 a）：
WHERE b = 2
-- 范围查询后的列失效：
WHERE a = 1 AND b > 10 AND c = 3   -- c 用不上索引
```

> 经验：把**区分度高、最常用作等值查询**的列放联合索引最左；避免对索引列做函数/运算（`WHERE YEAR(created_at)=2026` 会让索引失效，改成范围比较）。

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
- `type`：从 `ALL`（全表扫描，最坏）到 `const`（最好），争取 `ref`/`range` 以上。
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

> 「无限滚动」类列表务必用游标分页（where id < lastId），别用大 OFFSET。这是列表接口最常见的性能坑。

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
MarketApp.init({ /* ... */ }, {
  sequelize,
  indexes: [{ fields: ['uploadedby'] }, { fields: ['uploadedby', 'name'] }],
})
// 预加载避免 N+1
await MarketApp.findAll({ include: [{ model: User, as: 'author' }] })
```

> VueChestServer 的 `market_apps.AUTO_INCREMENT` 必须 > MAX(id)（清库 DELETE 不回退计数器），修复用 `ALTER TABLE ... AUTO_INCREMENT = MAX(id)+1`（见项目约定）。`information_schema` 的 AUTO_INCREMENT 对 InnoDB 不可靠，需用事务插入+回滚探针确认真实下一个 id。

## 八、面试速记

| 主题 | 必会 |
|------|------|
| 索引 | B+树、聚簇/二级、回表 |
| 最左前缀 | 联合索引从左用起、范围后失效 |
| 事务 | ACID、隔离级别、长事务危害 |
| 排查 | EXPLAIN、type/key/rows/Extra |
| 分页 | 深 OFFSET 慢 → 游标分页 |
| 设计 | 只查所需列、JOIN 索引、连接池 |

## 参考来源

- MySQL 官方文档：<https://dev.mysql.com/doc/>
- 《高性能 MySQL》（Baron Schwartz 等）
- EXPLAIN 详解：<https://dev.mysql.com/doc/refman/8.0/en/explain-output.html>
- Sequelize 模型与索引：<https://sequelize.org/docs/>
