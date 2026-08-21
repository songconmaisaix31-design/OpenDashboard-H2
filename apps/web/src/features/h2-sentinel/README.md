# H2 Sentinel Web Feature

This subtree contains the six-view Simplified Chinese H2 Sentinel presentation.
It is deliberately composition-only: every dataset, event, time series,
assistant answer, and export arrives through an injected
`H2SentinelDataSource`. The feature does not call `fetch`, inspect secrets,
control equipment, or own analytics formulas.

## Public composition seam

```tsx
import { H2SentinelApp } from './features/h2-sentinel/index.ts'

<H2SentinelApp dataSource={resolvedH2SentinelDataSource} />
```

H6 should resolve the accepted H2 plugin service from the static plugin runtime
and pass it to this component. `main.tsx`, plugin registration, and root scripts
remain integration-owned and are intentionally unchanged here.

Direct feature locations use hash routes:

```text
#h2/overview
#h2/events
#h2/diagnosis/C03-20260105-001
#h2/diagnosis/C04-20260105-001
#h2/analysis
#h2/assistant
#h2/reports
```

`initialRoute`, `initialEventId`, and `syncHash={false}` are available when H6
mounts the feature behind an existing router.

## Behavior

- The mode/provenance banner remains visible on every ready view.
- Fixture and Live Analysis use the same injected contract.
- A clean Live Analysis source with no datasets shows an accessible CSV picker;
  imports are limited to `.csv` files up to 5 MiB before content is read,
  matching the accepted H1 sidecar boundary.
- C03 and C04 are directly accessible from overview, event center, and hash
  routes.
- Unknown routes and malformed encoded diagnosis hashes fail closed to the
  overview instead of interrupting feature startup.
- Components render supplied evidence and impact values; they do not calculate
  anomaly impact. The feature-owned preview correction expects C04 impact
  `29.333333333333332 kWh` from Contract Gate correction input `4f2a8a3`.
- Missing time series degrade charts without replacing canonical event data.
- Missing validation labels do not produce synthetic confusion matrices or
  scores.
- Unknown safety is distinct from passed safety.
- Assistant and report actions call only their injected data-source methods.

## Hugo Stack presentation refactor

The competition feature keeps its React/TypeScript runtime and injected data
contracts. A separate `styles/hugo-stack-refactor.css` layer, plus feature-local
`H2Shell`, `PageHeader`, `StackWidget`, and inline SVG icon components, ports the
profile sidebar, article cover, card stack, and context-widget composition used
by the personal Hugo homepage. No Hugo runtime, new dependency, analytics logic,
or direct request path is introduced. See the repository-level
`REFACTOR_NOTES.md` and `design-preview.html` in the delivered archive.

## ECharts reuse decision

- Need: synchronized time-series, constraint lines, event bands, tooltips, and
  narrow-screen zoom.
- Project checked: Apache ECharts 6.
- Official source: https://github.com/apache/echarts
- License: Apache-2.0.
- Decision: adopt the already-gated root dependency through
  `components/charts/EChartsCanvas.tsx`.
- Imports are tree-shaken from `echarts/core`, `echarts/charts`,
  `echarts/components`, and `echarts/renderers`; no React chart wrapper or copied
  vendor source is added.
- Fallback: canonical evidence remains readable when series loading or chart
  rendering is unavailable.

## Local feature preview

After installing the root lockfile dependencies:

```bash
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/src/features/h2-sentinel/preview/index.html
```

The preview is explicitly Fixture-backed and lives inside this owned subtree.
It is not runtime proof of the H2 plugin or Live Analysis sidecar.

## Verification

```bash
node --import tsx --test "apps/web/src/features/h2-sentinel/test/*.test.ts*"
npm run typecheck
npm run test
npm run build
npm run check
git diff --check
```
