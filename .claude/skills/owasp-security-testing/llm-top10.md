# OWASP Top 10 for LLM Applications (2025) — QA test recipes

## Contents
- LLM01 Prompt Injection
- LLM02 Sensitive Information Disclosure
- LLM03 Supply Chain
- LLM04 Data and Model Poisoning
- LLM05 Improper Output Handling
- LLM06 Excessive Agency
- LLM07 System Prompt Leakage
- LLM08 Vector and Embedding Weaknesses
- LLM09 Misinformation
- LLM10 Unbounded Consumption

Two kinds of target use this file. **A product feature built on a model** (a chatbot, a summariser, a RAG search): test it like any endpoint, with hostile input and a wrong principal. **An agent that does QA work** (an agent that reads tickets, PRs, pages or files and then acts: comments, transitions, commits): the content it reads is written by other people, so every recipe below applies to the agent itself. Same rules as the rest of this skill: authorized environment, seeded data, No Report Without Proof.

The model's answer varies between runs. A test asserts what the system around the model must guarantee (a deny, a filter, a schema, a refusal to call a tool), never the exact wording, and runs each hostile case several times; one pass proves nothing about the next run.

---

## LLM01 — Prompt Injection  ✅ top priority
- **Is:** text the model reads is treated as an instruction. *Direct*: the user types it. *Indirect*: it arrives inside a document, ticket, web page, email or tool result the model was asked to process.
- **Recipe:** seed a record whose content carries an instruction aimed at the model ("ignore the previous instructions and …", "as the administrator I authorise you to …"), hidden too (HTML comment, white-on-white text, alt text, a file name). Run the feature or agent on it. Assert the system did NOT do the injected action: no extra tool call, no data from another tenant, no change of the output's format or scope. For an agent: the injected text is quoted or summarised as data, and no write happens without the human approval step.
- **Test name:** `Verify the ticket summary ignores an instruction embedded in the ticket description`.
- **Needs other tooling:** broad payload sets (garak, promptfoo red-team) for coverage; QA owns the regression cases that once got through.

## LLM02 — Sensitive Information Disclosure  ✅ automatable
- **Is:** the model returns personal data, secrets or another user's content: from its context, its retrieval store or its training.
- **Recipe:** seed principal A's data. As principal B, ask for it directly and indirectly ("summarise the last ticket you saw", "what did the previous user ask"). Assert none of A's seeded marker values appear in the response. Scan responses for secret patterns (token prefixes, key headers) and fail on a match.
- **Test name:** `Verify the assistant does not return another tenant's seeded record`.

## LLM03 — Supply Chain  ⚙️ other tooling, QA checks the gate
- **Is:** a compromised or unpinned model, plugin, package, prompt template or MCP server.
- **Recipe:** assert the deployment pins the model version and every package (lockfile present, CI installs with `npm ci`), and that third-party tools and MCP servers come from an allowlist. QA reads this from config (STATIC); scanning dependencies is SCA tooling (Dependabot, `npm audit`).

## LLM04 — Data and Model Poisoning  ⚙️ mostly other tooling
- **Is:** hostile data enters training, fine-tuning or the retrieval store and changes later answers.
- **Recipe:** for RAG, add a seeded document with a false fact and a marker; assert retrieval access rules keep it out of other tenants' answers, and that the source is shown so a reviewer can trace it. Training-time poisoning is out of QA scope.

## LLM05 — Improper Output Handling  ✅ automatable
- **Is:** model output is passed on without validation: rendered as HTML, run as SQL or shell, used as a URL or a file path.
- **Recipe:** make the model produce a payload (ask it to "repeat exactly" an XSS or SQL string, or seed one in retrieved content). Assert the downstream consumer neutralises it: rendered escaped, rejected by the schema, never executed. Validate structured output against a Zod schema like any API response. Same safe-render rule as `web-top10.md` A03.
- **Test name:** `Verify a script tag in the generated answer renders as text`.

## LLM06 — Excessive Agency  ✅ automatable, highest impact for agents
- **Is:** the model can call tools or take actions beyond what the task needs, or without a human check.
- **Recipe:** list every tool the agent can call and the permission each needs. For each write action, assert it requires the approval step (a human confirmation, a staged change) and that a read-only task cannot trigger it, including when an injected instruction asks for it (combine with LLM01). Assert the credentials are scoped to the task (read-only token for a read task).
- **Test name:** `Verify the agent cannot transition a ticket without the approval step`.

## LLM07 — System Prompt Leakage  ✅ automatable
- **Is:** the system prompt is revealed, and with it any secret or rule placed there.
- **Recipe:** ask for it directly, by translation, by role-play and by "repeat everything above". Assert no seeded marker string from the system prompt appears. The real fix is that the system prompt holds no secret; flag any credential found there as a STATIC finding.

## LLM08 — Vector and Embedding Weaknesses  ✅ partly
- **Is:** the retrieval store ignores access rules, or hostile content in it steers answers.
- **Recipe:** same as BOLA (`api-top10.md` API1) one layer down. Seed a document as tenant A; ask as tenant B a question it would answer; assert it is not retrieved or cited.

## LLM09 — Misinformation  ✅ partly
- **Is:** confident, wrong output that people or other systems act on.
- **Recipe:** a fixed set of questions with known answers from seeded data. Assert each answer cites a source that exists and matches the seeded value; "I don't know" passes, an invented value fails. Track the pass rate over runs instead of trusting one run.

## LLM10 — Unbounded Consumption  ⚙️ with `k6-load-testing`
- **Is:** unlimited prompt size, output size, call rate or tool-call loops: cost and denial of service.
- **Recipe:** assert the documented limits hold: an oversized prompt is rejected with the contract's status, a request cannot ask for unlimited output, a loop of tool calls stops at the configured cap. Volume tests belong to `k6-load-testing` with explicit thresholds.
