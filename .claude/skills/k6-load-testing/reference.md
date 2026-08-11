# k6 Load Testing — reference

Catalogs moved out of `SKILL.md` so the rules fit inside the boundary the skill contract sets. Decisions and anti-patterns stay in [`SKILL.md`](SKILL.md); what exists lives here.

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
