# H2 Sentinel Web Feature

This subtree contains the six-view Simplified Chinese H2 Sentinel presentation.
Every dataset, event, time series, assistant answer, and export arrives through
an injected `H2SentinelDataSource`. The feature does not inspect secrets,
control equipment, or own analytics formulas.

## Public composition seam

```tsx
import { H2SentinelApp } from './features/h2-sentinel/index.ts'

<H2SentinelApp dataSource={resolvedH2SentinelDataSource} />
```

The root H2 entry resolves the registered plugin service and passes it to this
component. Fixture and Local use the same view contract while retaining
different, visible provenance.

Direct feature locations use hash routes:

```text
#h2/overview
#h2/events
#h2/diagnosis/<event-id>
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
  imports are limited to `.csv` files up to 96 MiB before content is read. The
  Local service accepts at most 180,000 rows per request, so the full training
  set remains chunk-only.
- Live Analysis supports deterministic C01-C07 events. The sanitized Fixture
  intentionally remains a small C03/C04 demonstration and is never presented
  as official-data evidence.
- Detected events are directly accessible from the overview, event center, and
  diagnosis hash routes.
- The overview exposes one judge path through source identity, data quality,
  event evidence, human review, bounded assistant explanation, and export.
- Unknown routes and malformed encoded diagnosis hashes fail closed to the
  overview instead of interrupting feature startup.
- Components render supplied evidence and impact values; they do not calculate
  anomaly impact.
- Missing time series degrade charts without replacing canonical event data.
- Missing validation labels do not produce synthetic confusion matrices or
  scores.
- Unknown safety is distinct from passed safety.
- Assistant and report actions call only their injected data-source methods.
- Q01-Q10 remain exact deterministic prompts. The free-text follow-up router
  uses an injected feature-local `resolveNlu` capability when available and a
  clearly labeled closed local resolver otherwise. Both paths resolve only one
  supported intent, validate current event context, and refuse unknown, mixed,
  stale, or equipment-control requests before calling `ask`.
- Optional LLM rendering is requested only through the existing single `ask`
  call. The returned answer mode and provenance label rendered, deterministic,
  or fallback output without a transient answer-ID follow-up request.

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
- The chart runtime is loaded lazily behind the chart boundary so the main
  application bundle does not carry the complete ECharts runtime up front.

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
npm run h2:check
npm run typecheck
npm run test
npm run build
git diff --check
```
