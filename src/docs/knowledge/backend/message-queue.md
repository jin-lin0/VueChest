---
group: 消息与搜索
order: 1
---

# 消息队列实战

> 消息队列可以异步、削峰和连接不同生命周期，但也引入重复、乱序、积压和运维成本。本文对比 Kafka / RabbitMQ / Redis Streams，重点讲事务消息、消费幂等、重试与可观测性。

## 一、为什么需要消息队列

- **异步**：耗时操作（发邮件、生成报表）丢给消费者，接口秒回。
- **解耦**：生产者不依赖消费者，模块独立演进、独立扩容。
- **削峰**：秒杀/突发流量先进队列，消费者按能力匀速处理，保护 DB。
- **可恢复投递**：持久化、复制与确认机制降低丢失风险，并支持重放；端到端正确性仍需生产者、Broker 和消费者共同设计。

## 二、主流方案对比

| 方案             | 模型                    | 定位               | 特点                             |
| ---------------- | ----------------------- | ------------------ | -------------------------------- |
| **Kafka**        | 分区日志（append-only） | 高吞吐、流处理     | 海量、可重放、顺序保证（分区内） |
| **RabbitMQ**     | 交换机+队列（AMQP）     | 复杂路由、任务队列 | 灵活路由、成熟、企业常用         |
| **Redis Stream** | 流 + 消费组             | 轻量、低延迟       | 复用 Redis，功能较简             |

## 三、核心概念（以 Kafka 为例）

- **Topic**：消息类别；**Partition**：分区，并行单位，分区内有序。
- **Producer** 发消息；**Consumer Group** 组内分摊消费，一条消息仅被组内一个消费者处理。
- **Offset**：消费者进度指针，提交后代表"已处理"，支持重放（从头读）。

## 四、消费幂等（必会）

网络重试/重复投递会导致同一条消息被处理多次，必须幂等：

- **业务去重**：用唯一键（订单号/消息 ID）做 `INSERT ... ON DUPLICATE` 或 Redis `SETNX` 标记已处理。
- **状态机**：处理前检查"是否已完成"，已完成则跳过。
- **原子/幂等边界**：Kafka 事务可覆盖 Kafka 内的消费-生产链路，但普通业务数据库写入与 Broker offset 通常不是同一事务。更常见做法是允许重放，并让业务写入幂等。

## 五、可靠性保障

- **降低丢失**：Producer `acks=all`、合理的 `min.insync.replicas`、Broker 多副本、Consumer 成功后再确认；还要验证磁盘/跨区故障语义。
- **接受重复**：幂等 Producer 不能消除消费者或外部系统的所有重复，消费端仍需幂等。
- **有序**：单分区内天然有序；跨分区需业务键 hash 到同分区。
- **积压**：监控 lag，消费者扩容 / 提并行度 / 临时加应急消费组。

## 六、与 VueChest 的衔接

- **异步任务**：AI 对话计费、市场 app 构建通知、邮件/站内信，可用队列异步化。
- **削峰**：发布/上传高峰先入队，避免直接打爆 MySQL（见 `mysql-optimization.md`）。
- **事件驱动**：用户行为 → 发事件 → 多消费者（统计/推荐/审计）解耦处理。
- 轻量场景用 Redis Stream（已有 Redis）即可，不必立刻上 Kafka。

## 七、常见坑

- **消费者慢导致积压**：先扩容消费者，再查是不是单条处理太重。
- **死信队列（DLQ）**：处理失败 N 次转入 DLQ 人工排查，别让坏消息阻塞主队列。
- **消息体过大**：大文件走对象存储（R2），队列只传引用。
- **顺序误用**：默认多分区无序，需顺序的业务必须绑定到同一分区。

## 八、Transactional Outbox

“写数据库成功，但发消息失败”会丢事件；“先发消息再写库”又可能让消费者看到不存在的业务状态。Outbox 把业务变更和待发布事件写进同一个本地事务：

```sql
START TRANSACTION;
UPDATE orders
SET status = 'PAID', version = version + 1
WHERE id = :order_id AND version = :expected_version;

INSERT INTO outbox_events
  (event_id, aggregate_id, event_type, payload, status, created_at)
VALUES
  (:event_id, :order_id, 'order.paid.v1', :payload, 'pending', NOW());
COMMIT;
```

独立 relay 轮询/CDC 发布 outbox，Broker 确认后标记完成。relay 在“已发布但未标记”时崩溃仍会重复，所以 event ID 与消费幂等不可省。Outbox 表还需索引、清理、积压监控和毒事件隔离。

## 九、消费者模板与重试

消费者先校验 envelope/schema，再执行业务；成功才确认。不可重试的格式/权限错误直接进隔离队列，可重试的瞬时错误使用退避与上限：

```js
async function handleMessage(message) {
  const event = eventSchemas.parse(message.value)

  try {
    await db.transaction(async (tx) => {
      const firstSeen = await tx.processedEvents.insertIfAbsent(event.id)
      if (!firstSeen) return
      await handlers[event.type](tx, event.payload)
    })
    await message.ack()
  } catch (error) {
    if (isPermanent(error) || message.attempt >= MAX_ATTEMPTS) {
      await deadLetter.publish({ original: message, reason: safeCode(error) })
      await message.ack()
      return
    }
    await message.retry({ delayMs: backoffWithJitter(message.attempt) })
  }
}
```

这段是 provider-neutral 骨架：Kafka、RabbitMQ、Redis Streams 的 ack/offset/retry API 不同。不要在主消费循环里 `sleep` 很久阻塞分区；延迟重试可用重试 topic/queue，并保留原 event ID、首次时间和 attempt。

## 十、Schema、顺序与演进

事件 envelope 建议包含 `event_id`、`type`、`schema_version`、`occurred_at`、`producer`、`trace_id`、partition key 和 payload。破坏性字段变更发布新版本，生产者先兼容、消费者后迁移；Schema Registry 或契约测试用于阻止不兼容发布。

Kafka 只保证单 partition 的追加顺序，RabbitMQ/Streams 在重投递、多个消费者和失败重试后也可能改变观察顺序。需要实体内顺序时用 aggregate ID 作 partition/routing key，并在消费者用业务 version 拒绝旧事件。全局顺序代价高且常成为吞吐瓶颈。

“消息发生时间”不等于“处理时间”，跨服务时钟也可能偏差。业务状态机应使用版本和允许转换，不用时间戳大小盲目覆盖。

## 十一、积压、背压与可观测性

监控生产/消费速率、Kafka consumer lag 或队列深度、最老消息年龄、处理 P95/P99、重试/DLQ、rebalance、分区倾斜和消息大小。只看消息条数会忽略单条耗时，最老年龄更能反映用户等待。

扩消费者受分区数、下游容量和热点 key 限制；盲目扩容可能打垮数据库。先定位是生产突增、毒消息、外部依赖慢还是分区倾斜，再限流生产者、批处理、扩分区/消费者或启用降级。DLQ 必须有告警、查看、修复和安全重放流程，否则只是“消息墓地”。

## 十二、选型决策清单

- [ ] 业务需要任务队列、复杂路由、事件日志/重放，还是 Redis 已足够？
- [ ] 可接受的丢失、重复、顺序、延迟和保留语义是否写清？
- [ ] 数据库变更与发事件之间是否使用 outbox/CDC 或等价方案？
- [ ] event ID、schema version、partition key 和 trace ID 是否稳定？
- [ ] 消费副作用是否幂等，重试会不会重复发信、扣款或创建记录？
- [ ] retry/DLQ 是否有上限、告警、修复与重放审计？
- [ ] 分区数、消费者并发是否与下游数据库容量共同压测？
- [ ] Broker 故障、消费者崩溃、rebalance 与积压恢复是否演练？

## 十三、小结

- 价值：异步、解耦、削峰、可靠投递。
- 选型：高吞吐流处理选 Kafka，复杂路由选 RabbitMQ，轻量选 Redis Stream。
- 消费幂等 + offset 提交是可靠性核心；积压监控与 DLQ 保生产稳。

## 参考来源

- Apache Kafka 文档：<https://kafka.apache.org/documentation/>
- RabbitMQ 教程：<https://www.rabbitmq.com/tutorials>
- Redis Streams：<https://redis.io/docs/latest/develop/data-types/streams/>
