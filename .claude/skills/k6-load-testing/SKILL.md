---
name: k6-load-testing
description: Author and run k6 load, stress, spike, and soak tests in TypeScript against the platform APIs — bundler setup, executors, thresholds, custom metrics, auth, Grafana/InfluxDB output. Use for any performance-testing request. Triggers — "load test", "stress test", "spike", "soak", "k6", "SLO", "performance benchmark". Not for functional API tests (api-testing).
metadata:
  category: domain
---

# k6 Load Testing

Write realistic k6 performance tests in TypeScript for the platform APIs. Keep them deterministic, SLO-driven, and runnable locally or in CI.

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

## Executor choice

| Executor | Use for |
|----------|---------|
| `constant-arrival-rate` | Hold a fixed RPS — the "real" load pattern. **Default for load tests.** |
| `ramping-arrival-rate` | Ramp RPS up/down — load with warm-up, stress to find the knee. |
| `constant-vus` | Hold N concurrent users — use when measuring concurrency, not throughput. |
| `ramping-vus` | Ramp VUs up/down — legacy; prefer arrival-rate variants unless modelling user sessions. |
| `per-vu-iterations` | Smoke tests with deterministic iteration count per VU. |
| `externally-controlled` | Grafana k6 Cloud / CLI-driven scaling. |

**Rule of thumb:** arrival-rate executors decouple target RPS from VU count. Use them whenever you care about throughput SLOs.

---

## Thresholds & custom metrics

### Built-in metrics to threshold

- `http_req_failed` — error rate (`rate<0.01`)
- `http_req_duration` — latency percentiles (`p(95)<500`)
- `checks` — assertion pass rate (`rate>0.99`)
- `iteration_duration` — end-to-end scenario time (`p(95)<2000`)

### Custom metrics

```ts
// tests/perf/lib/metrics.ts
import { Trend, Counter, Rate } from "k6/metrics";

export const createLatency = new Trend("create_monitor_latency", true);
export const createFailures = new Rate("create_monitor_failures");
export const createdMonitors = new Counter("created_monitors_total");
```

Use them to threshold business-level SLOs that HTTP latency alone doesn't capture (e.g., end-to-end "monitor created & visible in listing" time).

### Threshold tagging pattern

Tag each request with `name` (endpoint identity) **and** `operation` (business action):

```ts
http.get(url, { tags: { name: "list_monitors", operation: "read" } });
```

Then threshold by both:

```ts
thresholds: {
  "http_req_duration{operation:read}":  ["p(95)<300"],
  "http_req_duration{operation:write}": ["p(95)<800"],
}
```

---

## Shared helpers

### `lib/env.ts` — centralised env loading

```ts
export const BASE_URL = __ENV.BASE_URL ?? "https://staging.example.com";
export const TOKEN    = __ENV.TOKEN    ?? "";
export const TENANT   = __ENV.TENANT   ?? "default";

if (!TOKEN) throw new Error("TOKEN env var is required");
```

### `lib/http.ts` — checked HTTP client

```ts
import http, { RefinedParams, ResponseType } from "k6/http";
import { check } from "k6";
import { TOKEN, TENANT } from "./env";

const defaultHeaders = {
  "Authorization": `Bearer ${TOKEN}`,
  "X-Tenant":      TENANT,
  "Content-Type":  "application/json",
};

type Params = RefinedParams<ResponseType> & { name: string };

export function getJson(url: string, { name, ...rest }: Params) {
  const res = http.get(url, {
    ...rest,
    headers: { ...defaultHeaders, ...rest.headers },
    tags: { name, ...rest.tags },
  });
  check(res, { [`${name} status 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

export function postJson<T>(url: string, body: T, { name, ...rest }: Params) {
  const res = http.post(url, JSON.stringify(body), {
    ...rest,
    headers: { ...defaultHeaders, ...rest.headers },
    tags: { name, ...rest.tags },
  });
  check(res, { [`${name} status 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}
```

### Data-driven fixtures — `SharedArray`

`SharedArray` loads the file **once per test run** and shares the read-only copy across all VUs — critical for large fixtures (otherwise each VU copies the data and memory blows up).

```ts
import { SharedArray } from "k6/data";
import { randomItem } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const postcodes = new SharedArray("postcodes", () =>
  JSON.parse(open("../fixtures/postcodes.json")) as string[]
);

export default function () {
  const pc = randomItem(postcodes);
  // ...
}
```

### Auth — login once, reuse per VU

```ts
import { postJson } from "./http";

let cachedToken: string | null = null;

export function getToken(): string {
  if (cachedToken) return cachedToken;
  const res = postJson(`${__ENV.AUTH_URL}/token`, {
    client_id: __ENV.CLIENT_ID,
    client_secret: __ENV.CLIENT_SECRET,
    grant_type: "client_credentials",
  }, { name: "auth_token" });
  cachedToken = res.json("access_token") as string;
  return cachedToken;
}
```

Note: `cachedToken` is per-VU (each VU has its own module state), **not** global — which is what you want for realistic session modelling.

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

## Helper scripts

Three scripts in `scripts/` (sibling to this SKILL.md). **Execute them**; don't copy their content into tests.

| Script | Purpose |
|--------|---------|
| `scripts/bundle.sh <entry.ts> <out.js>` | Bundle a single TS entrypoint via esbuild into k6-runnable JS |
| `scripts/run.sh <entry.ts> [k6-args...]` | Bundle + run with k6 binary (auto-detects Docker if k6 not installed) |
| `scripts/check-thresholds.sh <summary.json>` | Parse k6 summary.json, exit nonzero if any threshold failed |

All scripts are bash + POSIX-compatible. Run from repo root.

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
