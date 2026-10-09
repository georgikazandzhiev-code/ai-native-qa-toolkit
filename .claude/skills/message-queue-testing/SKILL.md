---
name: message-queue-testing
version: 1.0.0
description: Test asynchronous messaging and queues as QA targets — delivery guarantees, message ordering, dead-letter routing, retry and poison-message handling, consumer-group rebalance, transactional commit/rollback, backpressure, and schema-validated envelopes. Use when the system under test produces or consumes messages on a queue, stream, or event bus and you need to prove delivery is correct rather than assume it, or when a story touches async processing, eventual consistency, or a dead-letter path. Trigger phrases — "message queue", "queue test", "dead letter", "DLQ", "consumer group", "at-least-once", "event bus", "poison message", "async delivery". Do NOT use for synchronous REST/RPC endpoint tests (use the `api-testing` skill). Do NOT use for load/throughput numbers under volume (use the `k6-load-testing` skill). Do NOT use for picking UI locators or asserting rendered state (use the `selectors` skill).
metadata:
  category: domain
---

# Message Queue Testing

Testing for **asynchronous** systems: the ones where a producer drops a message and a consumer picks it up later, across a queue, a stream, or an event bus. Synchronous API tests prove a call returns the right answer now; these tests prove a message is **delivered, in the guaranteed order, exactly as the contract promises — and that the failure paths (retry, dead-letter, redelivery) do what they say.** The failure mode they prevent: a green suite that produced a message and never confirmed anything consumed it, asserted ordering the broker never promised, or trusted a dead-letter path that silently drops.

It builds on `api-testing` (a message envelope is validated with a Zod schema, the same way a response body is) and `type-safety` (strict schemas for every payload). It stays broker-agnostic: the concerns below — delivery guarantee, ordering scope, dead-letter routing, redelivery — are the same whatever the broker family, so the skill names the **guarantee**, not the product.

**Evidence: STATIC.** The patterns follow standard async-messaging contracts (delivery semantics, DLQ routing, consumer-group rebalance) expressed in this toolkit's schema-and-cleanup conventions. They have not been executed against a broker from this project; record the first real run in `memories/learned_patterns.md`.

This skill has no paired rule (rule disposition: skill-only). It applies the framework's existing schema, cleanup, and no-hard-wait rules to the messaging surface; it adds no constitution MUST.

## Critical

Non-negotiable. Each rule is what separates a real async test from "the producer didn't throw".

- **ALWAYS consume and assert the actual message — never stop at the produce call.** A test that publishes and ends proves nothing arrived. Consume it (bounded wait, below), parse the envelope, and assert its contents. An un-consumed produce is not a test.
- **NEVER use a fixed sleep to wait for a message.** `waitForTimeout(3000)` is flaky and proves nothing — it passes when the message never came and the next machine is slower. Consume with a **bounded poll/await that resolves on the message or fails on timeout**, and assert on the message. (Same intent as the framework `No hard waits` rule, applied to the consumer side.)
- **ALWAYS validate the message envelope against a Zod schema** — `expect(MessageSchema.parse(body)).toBeTruthy()`, exactly as `api-testing` validates a response. A message whose shape you never checked is an un-typed blob; an envelope the broker added fields to is a contract drift to catch.
- **ALWAYS assert the system's DOCUMENTED delivery guarantee, and test duplicates when it is at-least-once.** At-least-once means redelivery happens — the consumer MUST be idempotent, so send the same message twice and assert one effect. Exactly-once and at-most-once each have their own assertion; name which one the contract claims and test *that* one.
- **NEVER assert ordering the broker does not guarantee.** Per-key / per-partition order is testable where it is promised; global cross-partition order usually is not — asserting it makes a test that passes by luck and fails on rebalance. Test the guaranteed scope; document the rest as "no global order".
- **ALWAYS test the dead-letter path, not just the happy path.** A message that fails processing the documented number of times must route to the DLQ **with its failure metadata** (reason, original destination, retry count). A DLQ that silently drops, or a retry with no backoff, is a finding — report it (`bug-helper`), do not weaken the assertion.
- **NEVER run against a shared or production broker with live traffic.** Use a dedicated test broker / vhost / namespace with seeded messages, and purge what you produced in teardown. A leaked test message on a shared queue poisons the next run. (Mirrors `owasp-security-testing`'s authorized-environment rule.)
- **ALWAYS clean up produced messages and test queues in teardown.** Capture what you created in setup; drain or delete it in `afterEach`/`afterAll`. Leave the broker as you found it, exactly like API resource cleanup.

## The concerns — what to test on any broker

Route each to a test; skip only with a reason.

| Concern | What the test proves | Assert on |
|---------|----------------------|-----------|
| **Delivery guarantee** | The documented semantic holds (at-least-once → duplicates tolerated; exactly-once → one effect) | The consumed effect, under a redelivery |
| **Ordering** | Messages for one key/partition arrive in produce order | Sequence of consumed keys; never global order |
| **Dead-letter routing** | A message failing N times lands in the DLQ with metadata | DLQ contents + failure headers (reason, source, count) |
| **Retry & poison** | Retries follow the documented count and backoff, then quarantine | Retry count, backoff spacing, final DLQ placement |
| **Idempotency** | Re-processing the same message produces one effect | Single side effect after a duplicate delivery |
| **Consumer-group rebalance** | On consumer join/leave, partitions reassign with no loss | Every produced message consumed once across the group |
| **Transactional** | A message is invisible after rollback, visible after commit | Presence/absence of the message post-transaction |
| **Backpressure** | Producer slows or buffers when consumers lag | Documented flow-control behaviour at the depth threshold |
| **Schema** | Every message conforms; invalid ones are rejected or dead-lettered | `MessageSchema.parse` on valid; rejection/DLQ on invalid |

## Workflow — add messaging coverage for a flow

```
- [ ] 1. Map the flow — producer, destination (queue / stream / event bus), consumer(s), and the DLQ. Name the documented delivery guarantee and the ordering scope.
- [ ] 2. Define the envelope schema — a z.strictObject for the message body + headers, in fixtures/api/schemas (type-safety).
- [ ] 3. Seed a dedicated test destination — a test queue/topic/namespace, not a shared one. Capture names for cleanup.
- [ ] 4. Produce + consume — publish a known message, consume it with a bounded wait, parse with the schema, assert contents.
- [ ] 5. Cover the guarantee — for at-least-once, deliver a duplicate and assert idempotency; for ordering, produce a keyed sequence and assert per-key order.
- [ ] 6. Cover the failure paths — force a processing failure, assert retry count + backoff, assert the DLQ receives it with metadata.
- [ ] 7. Clean up — drain/delete the test destination and any DLQ entries in teardown. Leave the broker as found.
- [ ] 8. Report findings — a dropped message, a missing DLQ metadata field, order violated within a key: comment the test out with // TODO: FIXME: <TICKET> and file it. Never relax the assertion to green.
```

## Anti-patterns

- ❌ **Publish-and-end.** A test that produces a message and never consumes it asserts nothing. Consume and assert the delivered contents.
- ❌ **`waitForTimeout` to "let the message arrive".** Flaky and hollow. Use a bounded consume that resolves on the message or fails on timeout.
- ❌ **Asserting global ordering.** Most brokers guarantee order only per key/partition. A cross-partition order assertion passes by luck and breaks on rebalance.
- ❌ **Only the happy path.** No dead-letter test means the failure path is unverified — the exact place async systems lose data silently.
- ❌ **Ignoring duplicates under at-least-once.** If redelivery is possible and the consumer is not idempotent, the bug is real whether or not your test triggers it. Deliver a duplicate and assert one effect.
- ❌ **An un-schema'd message body.** Parse every envelope with a Zod schema; a blob you never typed hides contract drift.
- ❌ **Testing on a shared/live broker.** Leaked or interfering messages. Use a dedicated test destination and purge it.
- ❌ **No teardown.** A test queue that grows every run, or a DLQ never drained, turns the next run flaky. Clean up what you produced.
- ❌ **Relaxing the assertion to green** when a message drops or the DLQ lacks metadata. That is the finding — report it, do not hide it.

## Self-review checklist

- [ ] Every test consumes and asserts the delivered message; no publish-and-end.
- [ ] No fixed sleep — consumption is a bounded wait that resolves on the message or fails.
- [ ] Every envelope is parsed with a `z.strictObject` schema (`type-safety` / `api-testing` idiom).
- [ ] The documented delivery guarantee is asserted; at-least-once flows test a duplicate for idempotency.
- [ ] Ordering is asserted only within the guaranteed scope (per key/partition), never globally.
- [ ] The dead-letter path is tested: failure → retries with backoff → DLQ with metadata.
- [ ] A dedicated test destination is used, not a shared/production broker.
- [ ] Produced messages and test destinations are cleaned up in teardown.
- [ ] Findings (drops, missing metadata, order violations) are reported as bugs, never assertion-massaged.
- [ ] Tests reuse the project fixtures, tags, and cleanup; no parallel suite.

## Examples

### Example 1 — run-stat events reach the run-stats store

User says: _"Prove a job's run emits its run-stat event onto the queue stream and it lands in the run-stats store."_

1. **Flow** — a job run produces a `run-stat` event onto the run-stats queue stream; the run-stats consumer stores it. Guarantee: at-least-once. Ordering: per `jobId`.
2. **Schema** — `RunStatEventSchema` (`z.strictObject`) for the event body + headers.
3. **Seed** — a test job; a dedicated test stream. Capture both for cleanup.
4. **Produce + consume** — trigger a run; consume from the stream with a bounded wait; `expect(RunStatEventSchema.parse(event)).toBeTruthy()`; assert `event.jobId` and the run-stat values.
5. **Duplicate** — deliver the same event twice; assert the store holds **one** run-stat for that run (idempotent consumer).
6. **Cleanup** — delete the test job and drain the test stream in `afterAll`.

### Example 2 — a poison run message routes to the DLQ

User says: _"A run message the executor can't process should end up in the dead-letter queue, not vanish."_

1. **Flow** — a malformed run message is consumed by the executor; after the documented retries it must dead-letter.
2. **Force the failure** — publish a run message that fails validation in the executor.
3. **Assert retries** — the message is retried the configured number of times with the configured backoff (read both from config — `No magic numbers`).
4. **Assert the DLQ** — after the last retry, the message is in the DLQ with its failure metadata: reason, original destination, retry count.
5. **Finding** — if it is dropped instead, or the DLQ entry lacks the failure reason, that is the bug: comment out with `// TODO: FIXME: <TICKET>` and file via `bug-helper`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Test passes but nothing was really delivered | Publish-and-end — no consume | Consume the message with a bounded wait and assert its contents. |
| Test is flaky — sometimes the message "isn't there yet" | Fixed sleep instead of a real wait | Replace the sleep with a bounded poll/await that resolves on the message or fails on timeout. |
| Ordering test fails intermittently | Asserting order the broker doesn't guarantee (cross-partition) | Assert per-key/per-partition order only; document that global order is not guaranteed. |
| Duplicate messages break the test | Consumer is not idempotent under at-least-once | That is a real finding if redelivery is possible. Report it; the test correctly exposes it. |
| DLQ test finds the message dropped, not dead-lettered | Dead-letter routing or retry policy broken | Do not relax the assertion. Report via `bug-helper`; this is the win. |
| `Schema.parse` throws on the envelope | The broker added fields, or the body drifted | `z.strictObject` caught a contract change — update the schema deliberately, or file the drift. |
| Next run starts flaky | Previous run left messages or a full DLQ | Add teardown: drain/delete the test destination and DLQ entries. Use a fresh namespace per run. |

## See Also

- **`api-testing`** — the schema-validate-and-cleanup mechanics; a message envelope is validated like a response body, and the comment-out-with-ticket bug convention is the same.
- **`type-safety`** — `z.strictObject` schemas for message envelopes and the `expect(Schema.parse(body)).toBeTruthy()` idiom.
- **`data-strategy`** — faker for unique message ids/payloads, JSON for fixed envelopes, seeding a dedicated test destination.
- **`k6-load-testing`** — the boundary for throughput, consumer-lag-under-volume, and backpressure *at load*; this skill asserts the behaviour exists, k6 measures it under pressure.
- **`flakiness-triage`** — when an async test is intermittently red, the bounded-wait-vs-sleep distinction is the first thing to check.
- **`quality-gate`** — a release gate can require the dead-letter path tested for a messaging flow before shipping.
- **`bug-helper`** — filing a dropped message, a missing DLQ field, or a broken ordering guarantee as a triaged bug.
- **[~/.claude/CLAUDE.md](../../CLAUDE.md)** — always-on framework invariants; this skill routes from its Routed Skill Index.
