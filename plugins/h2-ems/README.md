# H2 EMS plugin

This statically reviewed Tier 1 plugin supplies one `H2SentinelDataSource`.
`h2EmsPlugin` always registers the deterministic Fixture source; integration may
use `createH2EmsPlugin(dataSource)` or `createH2EmsPlugin(liveOptions)` to
register an injected source or an explicitly enabled loopback source.

The Live adapter accepts only a literal `http(s)://127.0.0.1[:port]/` or IPv6
loopback base URL and uses the fixed `/api/v1/h2-sentinel` namespace. It has no
dynamic import, arbitrary route, process-control, or UI dependency. The manifest
capabilities are audit metadata, not sandbox enforcement.

## Reuse decision

- Need: a small browser-facing adapter for canonical H2 data and reports.
- Projects checked: OpenDashboard static plugin runtime and Fixture plugin.
- Official sources: repository-local reviewed contracts and runtime.
- License: project-local implementation; no third-party source copied.
- Adopt / adapt / reject: adapt existing static token and plugin pattern; reject a
  new HTTP client or validation dependency.
- Reason: platform `fetch`, `AbortController`, and focused structural guards keep
  the trust boundary explicit without new runtime dependencies.
- Files or APIs reused: `PluginDefinition`, `createServiceToken`, and
  `H2SentinelDataSource`.
- Fallback: Fixture mode remains fully offline when the analytics sidecar is absent.
