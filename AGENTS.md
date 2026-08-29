# H2 Sentinel Agent Guide

## Project

- Product: H2 Sentinel / 氢哨
- Stack: React 19, TypeScript 6, Vite 6, Node.js 22+, npm 11, Python 3.11+, FastAPI
- Primary directories: `apps/web`, `packages`, `plugins`, `services/h2-analytics`, `tests`, `submission`, `docs`
- UI language: Simplified Chinese
- Code, comments, file names, commit messages, and technical documents: English

## Product Boundaries

- Keep the application local-first and loopback-only in Local mode.
- Do not issue equipment-control commands. Recommendations require human confirmation.
- LLM rendering is optional and must never affect detection, evidence, safety, or review state.
- Treat Fixture output, local smoke, screenshots, and HTTP success as bounded evidence, not official-score or production proof.
- Never read, print, copy, or commit `.env` contents, credentials, tokens, cookies, or private keys.

## Development Rules

- Protect `main`. Implement changes on assigned branches or Orca worktrees.
- Preserve unrelated user changes and nested worktrees.
- Keep changes minimal and traceable to the accepted task. Reuse existing contracts and helpers before adding code or dependencies.
- Prefer functions and declarative state. Avoid new classes unless an existing project pattern requires one.
- Keep TypeScript strict. Do not use `any`; narrow external `unknown` values at trust boundaries.
- Start API or shared-state changes from the canonical contract in `packages/h2-contracts` or an accepted equivalent specification.
- Comments explain constraints and decisions, not obvious mechanics.
- Use `rg` for content search and `fd` for file search when available.
- Use `apply_patch` for focused manual edits. Do not reformat unrelated files.

## Required Workflow

For features, API/state changes, security, UI flows, or multi-file work:

1. Specify acceptance criteria, constraints, risks, owned paths, and verification in an approved spec.
2. Plan the smallest implementation that reuses current architecture.
3. Execute only within the assigned Orca task/worktree.
4. Verify focused tests first, then the relevant project checks.
5. Commit with an English Conventional Commit message and report the commit SHA.

If `karpathy-guidelines`, `ponytail`, or `ui-design-handoff-fidelity` is installed in the worker environment, use it when triggered. If unavailable, follow the corresponding scope, simplicity, and visual-verification rules in this file without inventing a replacement skill.

## Commands

```text
npm run typecheck
npm test
npm run h2:test
npm run h2:qa
npm run h2:launcher:test
npm run h2:build
npm run h2:check
cd services/h2-analytics && uv run --locked --extra dev python -m pytest -q
git diff --check
```

Use the narrowest relevant commands during implementation. Before integration completion, run `npm run h2:check`, the Python test suite, `npm test`, and `git diff --check`.

## P1 Competition Priorities

- Cover all ten official assistant questions with Chinese, evidence-grounded, deterministic answers.
- Add a local human-review workflow for event confirmation, rejection, notes, and auditable export without creating control authority.
- Provide a truthful three-minute validation-data demo path and keep Fixture clearly labeled as fallback evidence.
- Localize user-facing reports and errors needed by those flows.

## Git and Orca Coordination

- Each worker must honor its task's write allowlist and avoid files owned by another worker.
- Workers send exactly one Orca `worker_done` report for the active Dispatch and then stop.
- Do not merge, push, amend, force-push, reset, clean, or delete worktrees unless the coordinator explicitly assigns that action.
- The coordinator owns integration, cross-track fixes, final tests, runtime inspection, and the completion summary.
