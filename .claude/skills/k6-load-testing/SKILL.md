---
name: k6-load-testing
description: Author and run k6 load, stress, spike, and soak tests in TypeScript against the platform APIs — bundler setup, executors, thresholds, custom metrics, auth, Grafana/InfluxDB output. Use for any performance-testing request. Triggers — "load test", "stress test", "spike", "soak", "k6", "SLO", "performance benchmark". Not for functional API tests (api-testing).
metadata:
  category: domain
---

# k6 Load Testing

Write realistic k6 performance tests in TypeScript for the platform APIs. Keep them deterministic, SLO-driven, and runnable locally or in CI.

## What's in each file

| File | Purpose | Load when |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, test-type decision, SLO workflow, anti-patterns. | **Always** — on any performance-testing task. |
| **[`reference.md`](reference.md)** | Catalogs: executor choice, threshold and custom-metric syntax, shared helpers, helper scripts. | When configuring a run or reaching for a specific executor or metric. |

**Boundary rule:** decisions and rules here; syntax and catalogs in `reference.md`.

## Critical

Non-negotiable. A load test that breaks these produces a number nobody can act on.

- **NEVER run a load test against production without written authorisation naming the window.** A load generator is indistinguishable from an attack. Authorisation, the environment, and the agreed window go in the ticket before the first run.
- **ALWAYS define thresholds before the first run, derived from the SLO.** A run with no threshold cannot fail, so it cannot tell you anything. Numbers invented after seeing the result are a description, not a test.
- **NEVER report a percentile from a run whose error rate was non-trivial.** Latency measured while requests are failing is the latency of the failure path. Resolve or explain the errors first, then read the timing.
- **ALWAYS warm up before measuring, and state for how long.** Cold caches, JIT and connection setup make the first seconds unrepresentative; including them silently inflates every percentile.
- **NEVER share one data value across virtual users on a uniqueness-constrained field.** Every VU creating the same row measures the conflict path at scale. Parameterise per VU — see the `data-strategy` skill.
- **ALWAYS state the shape of the load, not just the total.** "1000 requests" is not reproducible; "100 VUs ramping over 2 minutes, held for 5" is. The executor choice is part of the result.
- **NEVER point a load test at a shared functional-test environment mid-suite.** It produces flake in the functional suite that reads as a product defect.

## When to use which test type

| Type | Goal | Duration | VUs / rate | Pass criteria |
|------|------|----------|------------|---------------|
| **Smoke** | Sanity check — does the endpoint work at 1 VU? | 30–60s | 1 VU | All thresholds green, 0 errors |
| **Load** | Validate SLOs under expected production traffic | 5–15 min | Target RPS / VUs | p95 latency, error rate under SLO |
| **Stress** | Find the breaking point | 10–30 min | Ramp up past capacity | Identify knee point, degradation mode |
| **Spike** | Validate recovery from sudden surge | 1–5 min | 0 → burst → 0 | Recovers to baseline within N seconds |
| **Soak** | Memory leaks, connection pool exhaustion, slow degradation | 1–8 hours | Steady moderate load | No upward latency trend, no error growth |

**Default choice:** start with a **smoke** test for every new endpoint, then add **load** with SLO thresholds. Only add stress/spike/soak when explicitly asked or when an SLO is at risk.

---

## Repo layout

All k6 tests live under `tests/perf/` in this repo (sibling to `tests/app/`):

```
tests/perf/
├── lib/                      # Shared TS helpers (auth, http, metrics)
│   ├── auth.ts               # Bearer-token helper, login-once-reuse-per-VU
│   ├── http.ts               # Wrapped http client with tags + checks
│   ├── metrics.ts            # Custom Trend / Counter / Rate
│   └── env.ts                # BASE_URL, TOKEN, TENANT from env
├── fixtures/                 # CSV / JSON fixtures (used via SharedArray)
│   └── postcodes.json
├── smoke/
│   └── monitors-smoke.ts
├── load/
│   └── monitors-load.ts
├── stress/
│   └── monitors-stress.ts
└── tsconfig.json             # Extends root but targets ES2015 for k6 VM
```

**Do not** put k6 scripts in `tests/app/` — Playwright runner would try to collect them.

---

## TypeScript → k6 bundle

k6 runs its own JS VM (Goja) and **does not execute TypeScript natively**. Use esbuild to bundle each entrypoint into a single ES2015 JS file.

### Bundle command

```bash
scripts/bundle.sh tests/perf/load/monitors-load.ts dist/monitors-load.js
```

The script invokes:

```bash
npx esbuild <entry> \
  --bundle --format=esm --platform=neutral --target=es2015 \
  --external:k6 --external:k6/* \
  --sourcemap=inline \
  --outfile=<output>
```

`--external:k6` / `--external:k6/*` preserves `import http from 'k6/http'` imports — k6 resolves them at runtime from its built-in module registry.

### Required `tests/perf/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "ES2015",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["@types/k6"],
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

Install types once: `npm i -D @types/k6 esbuild`.

---

## Test skeleton (TypeScript)

Every test file must export:
- `options` — scenarios, thresholds, tags
- `default` — the VU function

```ts
// tests/perf/load/monitors-load.ts
import { sleep } from "k6";
import { Options } from "k6/options";
import { getJson, postJson } from "../lib/http";
import { BASE_URL } from "../lib/env";

export const options: Options = {
  scenarios: {
    steady_load: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: 50, duration: "1m" },   // ramp
        { target: 50, duration: "5m" },   // hold
        { target: 0,  duration: "30s" },  // ramp down
      ],
    },
  },
  thresholds: {
    "http_req_failed": ["rate<0.01"],                // <1% errors
    "http_req_duration{name:list_monitors}": ["p(95)<500", "p(99)<1000"],
    "http_req_duration{name:get_monitor}":   ["p(95)<300"],
    "checks": ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  tags: { testType: "load", service: "monitors-api" },
};

export default function () {
  const list = getJson(`${BASE_URL}/api/monitors`, { name: "list_monitors" });
  if (list.status !== 200) return;

  const first = list.json()?.items?.[0]?.id;
  if (first) {
    getJson(`${BASE_URL}/api/monitors/${first}`, { name: "get_monitor" });
  }

  sleep(1);
}
```

**Non-negotiable:** every HTTP call carries a `name` tag so thresholds can target specific endpoints. Untagged calls all roll up into one bucket and make SLOs meaningless.

---

## Running tests

### Locally (k6 binary)

```bash
# Bundle + run
scripts/run.sh tests/perf/load/monitors-load.ts

# Inline env
BASE_URL=https://staging.example.com TOKEN=$TOKEN \
  scripts/run.sh tests/perf/smoke/monitors-smoke.ts
```

### Locally (Docker — no k6 install required)

```bash
docker run --rm -i \
  -v "$PWD:/work" -w /work \
  -e BASE_URL -e TOKEN -e TENANT \
  grafana/k6:latest run dist/monitors-load.js
```

### With Grafana + InfluxDB output

Add `-o influxdb=http://influxdb:8086/k6` to the k6 command. For local dev, use the official [grafana/k6 + Influx + Grafana docker-compose](https://github.com/grafana/k6/tree/master/samples/docker-compose) recipe and import dashboard `2587`.

```bash
scripts/run.sh tests/perf/load/monitors-load.ts -o influxdb=http://localhost:8086/k6
```

Prometheus remote-write (k6 v0.43+):

```bash
K6_PROMETHEUS_RW_SERVER_URL=http://prom:9090/api/v1/write \
  scripts/run.sh tests/perf/load/monitors-load.ts -o experimental-prometheus-rw
```

---

## SLO workflow

Copy this checklist for every new perf test:

```
- [ ] Define the SLO in plain English (p95 < 500ms for list, error rate < 1%)
- [ ] Pick test type (smoke → load → stress)
- [ ] Pick executor (default: constant-arrival-rate for load)
- [ ] Tag every HTTP call with {name, operation}
- [ ] Encode SLO as threshold (fails the test if breached)
- [ ] Smoke-run at 1 VU — verify it passes
- [ ] Scale to target load — investigate failures
- [ ] Export summary.json, check thresholds, attach to PR
```

---

## Integration with this repo

- **Tags (Qase / reporting):** use `tags: { testType: "load", service: "monitors-api" }` in `options` — matches the `@App-*` tagging convention for filterability.
- **Env loading:** mirror `env/.env.*` — perf tests read from `__ENV` (set via shell or `--env KEY=VAL`). Do **not** use `dotenv` — k6 runs in Goja and doesn't support Node modules.
- **Fixtures:** put JSON/CSV under `tests/perf/fixtures/`. Load via `SharedArray` (never `require`/`import` runtime data).
- **Zod validation:** skip it in perf tests — Zod schemas are heavy and distort measurements. Trust the API contract, verify only with lightweight `check()` calls on status + critical fields.
- **CI:** run smoke tests on every PR (fast, fail-fast), load tests nightly, stress/soak on demand.

---

## Anti-patterns

- ❌ **Sleeps to pace load** — use arrival-rate executors instead. `sleep()` is for think-time between user actions, not throughput control.
- ❌ **Reading fixtures in `default()`** — move to `init` context (top of module) via `SharedArray`.
- ❌ **Running unbundled TS directly** — k6 can't parse TypeScript. Bundle first.
- ❌ **Asserting with `expect()`** — k6 uses `check()` (non-fatal) and `fail()` (fatal). No Playwright-style expect.
- ❌ **One giant test file** — one entrypoint per scenario. Keep `options` clear and thresholds focused.
- ❌ **Shared mutable state across VUs** — each VU has isolated module state; don't fight it. Use `Counter` metric for shared counters.
- ❌ **Thresholds without tags** — a global `http_req_duration` p95 tells you nothing about which endpoint is slow.
- ❌ **Running stress/soak on production without approval** — always negotiate a window, use rate limits, and coordinate with SRE.

---

## Quick reference — minimal viable test

```ts
import http from "k6/http";
import { check, sleep } from "k6";
import { Options } from "k6/options";

export const options: Options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const res = http.get("https://test.k6.io", { tags: { name: "homepage" } });
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(1);
}
```

Bundle: `scripts/bundle.sh test.ts dist/test.js`
Run: `k6 run dist/test.js`

## Self-review checklist

- [ ] Authorisation for the target environment exists in writing, with the window named.
- [ ] Thresholds derived from the SLO and committed **before** the first run.
- [ ] Executor and load shape stated explicitly: VUs, ramp, hold, iterations.
- [ ] Warm-up period defined and excluded from the reported percentiles.
- [ ] Per-VU data parameterised; no shared value on a uniqueness-constrained field.
- [ ] Error rate reported alongside every latency figure, never latency alone.
- [ ] Run reproducible from the committed script and config, with no local edits.
- [ ] Result recorded with date, build, environment and load shape. A number missing any of the four is not comparable to the next run.
- [ ] Environment left as found; nothing the run seeded survives it.

## Examples

### Example 1 — turning "the API is slow" into a test that can fail

**Ask:** load-test the projects list endpoint, it feels slow.

"Feels slow" is not a threshold. Turn it into one before writing the script:

1. **Find the SLO.** If none exists, that is the first finding — propose one from current behaviour and get it agreed, rather than inventing a number inside the script.
2. **Pick the shape.** A steady read endpoint under normal traffic is a ramp-and-hold, not a spike. State it: 50 VUs, 1-minute ramp, 5-minute hold.
3. **Set both thresholds** — the latency percentile and the error rate. Both, or the run cannot distinguish fast-and-broken from slow-and-correct.
4. **Warm up** for 30 seconds and exclude it from the reported figures.
5. **Run, then read the error rate first.** If it is non-trivial, the latency number is not reportable yet.

The deliverable is a threshold that fails when the SLO is missed, not a graph.

### Example 2 — a spike test that only measured the conflict path

**Symptom:** a create-project spike test reports a percentile comfortably inside the SLO, and a 60% error rate.

**Cause:** every VU posted the same project name. The endpoint enforces uniqueness, so most requests short-circuited on a conflict — cheap, fast, and unrepresentative. The flattering percentile was the latency of a validation rejection.

**Fix:** parameterise the name per VU and per iteration, then re-run. The percentile rises, the error rate collapses, and only now is the number about the behaviour under test.

**The general lesson:** read the error rate before the percentile, every time. A good latency figure beside a bad error rate almost always means the load never reached the code path you cared about.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Latency looks excellent and the error rate is high | The load never reached the intended code path; requests are failing early and cheaply | Resolve the errors first. Read the error rate before any percentile. |
| Results differ substantially run to run on the same build | No warm-up, too short a hold, or a noisy shared environment | Add warm-up, lengthen the hold, and record which environment produced the number. |
| The run cannot fail | No thresholds, or thresholds set from the observed result after the fact | Derive thresholds from the SLO and commit them before running. |
| The functional suite turns flaky while a load test runs | The load test is writing to a shared environment | Isolate the target, or schedule outside the functional window. |
| Fine locally, terrible in CI | Different generator resources, or the generator itself is saturated | Check generator CPU and network before concluding anything about the service under test. |
| The first run after a deploy is much worse | Cold caches and connection setup | Expected; that is what warm-up excludes. Report cold-start separately if it matters. |
| Cannot compare this run to an earlier one | The earlier result lacks build, environment or load shape | Record all four with every result. Without them a number is not a baseline. |

## See Also

- [`api-testing`](../api-testing/SKILL.md) — functional API correctness. Load testing assumes the endpoint is already correct; verify that first.
- [`data-strategy`](../data-strategy/SKILL.md) — per-VU parameterisation. Shared fixed data is the most common cause of a meaningless load result.
- [`config`](../config/SKILL.md) — environment URLs and tokens come from configuration, never from the script.
- [`defect-prediction`](../defect-prediction/SKILL.md) — which endpoint to load-test first when the budget covers only a few.
- [`flakiness-triage`](../flakiness-triage/SKILL.md) — when a load run destabilises the functional suite, that skill classifies the fallout.
- [`owasp-security-testing`](../owasp-security-testing/SKILL.md) — a load generator against an unauthorised target is an attack; the authorisation discipline is shared.
- Orchestrator: [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — Sources of Truth applies to thresholds and URLs alike.
