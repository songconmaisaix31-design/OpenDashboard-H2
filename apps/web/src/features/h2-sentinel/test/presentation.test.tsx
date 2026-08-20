import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  H2_FIXTURE_REPORT_DESCRIPTOR,
  type H2AnomalyEvent,
} from '../../../../../../packages/h2-contracts/src/index.ts'
import { H2SentinelView } from '../H2SentinelView.tsx'
import {
  INITIAL_H2_COMMAND_STATE,
  type H2WorkspaceState,
} from '../model/view-state.ts'
import {
  filterH2Events,
  formatH2Duration,
  INITIAL_EVENT_FILTERS,
} from '../model/presentation.ts'
import {
  parseH2SentinelHash,
  toH2SentinelHash,
  type H2NavigationTarget,
} from '../routes.ts'
import {
  CORRECTED_C04_IMPACT_KWH,
  H2_WEB_FIXTURE_C04_EVENT,
  H2_WEB_FIXTURE_EVENTS,
  H2_WEB_FIXTURE_RUN,
} from './fixture-data-source.ts'

const noop = () => undefined

const readyState: H2WorkspaceState = {
  status: 'ready',
  workspace: {
    mode: 'FIXTURE',
    datasets: [H2_WEB_FIXTURE_RUN.dataset],
    run: H2_WEB_FIXTURE_RUN,
    events: H2_WEB_FIXTURE_EVENTS,
    series: null,
    seriesError: 'Focused SSR test does not render a chart instance.',
  },
}

describe('H2 Sentinel presentation', () => {
  it('keeps all six top-level views directly addressable', () => {
    const expectations = [
      [{ route: 'overview' }, '弱电网绿氢系统，异常一眼可查'],
      [{ route: 'events' }, '异常事件中心'],
      [{ route: 'diagnosis', eventId: H2_WEB_FIXTURE_EVENTS[0].eventId }, '证据链'],
      [{ route: 'analysis' }, '字段字典'],
      [{ route: 'assistant' }, '十个运行问题'],
      [{ route: 'reports' }, '竞赛提交结果'],
    ] as const satisfies readonly [H2NavigationTarget, string][]

    for (const [navigation, expectedText] of expectations) {
      assert.match(renderView(readyState, navigation), new RegExp(expectedText))
    }
  })

  it('shows truthful Fixture provenance and the corrected C04 impact', () => {
    const markup = renderView(readyState, {
      route: 'diagnosis',
      eventId: H2_WEB_FIXTURE_C04_EVENT.eventId,
    })

    assert.equal(H2_WEB_FIXTURE_C04_EVENT.impact.value, CORRECTED_C04_IMPACT_KWH)
    assert.match(markup, /FIXTURE · 固定样例/)
    assert.match(markup, /29\.33/)
    assert.doesNotMatch(markup, /86\.5/)
    assert.match(markup, /必须人工确认/)
  })

  it('distinguishes loading, empty, error, and unknown safety states', () => {
    assert.match(
      renderView({ status: 'loading', message: 'loading fixture' }, { route: 'overview' }),
      /正在加载可核验运行/,
    )
    assert.match(
      renderView({ status: 'empty', mode: 'LIVE_ANALYSIS' }, { route: 'overview' }),
      /导入第一份本地数据/,
    )
    assert.match(
      renderView({ status: 'error', message: 'redacted failure' }, { route: 'overview' }),
      /数据源暂不可用/,
    )

    const unknownEvent = {
      ...H2_WEB_FIXTURE_EVENTS[0],
      safetyChecks: [
        {
          ...H2_WEB_FIXTURE_EVENTS[0].safetyChecks[0],
          status: 'unknown',
          message: 'Required evidence is unavailable.',
        },
      ],
    } as H2AnomalyEvent
    const unknownState: H2WorkspaceState = {
      ...readyState,
      workspace: {
        ...readyState.workspace,
        run: { ...H2_WEB_FIXTURE_RUN, events: [unknownEvent] },
        events: [unknownEvent],
      },
    }
    assert.match(
      renderView(unknownState, { route: 'diagnosis', eventId: unknownEvent.eventId }),
      /证据不足/,
    )
  })

  it('filters without mutating the source event collection', () => {
    const original = [...H2_WEB_FIXTURE_EVENTS]
    const filtered = filterH2Events(H2_WEB_FIXTURE_EVENTS, {
      ...INITIAL_EVENT_FILTERS,
      code: 'C04',
      minConfidence: 0.9,
    })

    assert.deepEqual(H2_WEB_FIXTURE_EVENTS, original)
    assert.deepEqual(filtered.map(({ code }) => code), ['C04'])
    assert.equal(formatH2Duration('2026-01-05T10:32:00Z', '2026-01-05T10:39:00Z'), '8 分钟')
  })

  it('round-trips diagnosis hashes and falls back for unknown or malformed hashes', () => {
    const target = { route: 'diagnosis', eventId: 'C04-20260105-001' } as const
    assert.deepEqual(parseH2SentinelHash(toH2SentinelHash(target)), target)
    assert.deepEqual(parseH2SentinelHash('#h2/not-real'), { route: 'overview' })
    assert.deepEqual(parseH2SentinelHash('#h2/diagnosis/%E0%A4%A'), {
      route: 'overview',
    })
  })

  it('shows the complete content hash for the latest artifact', () => {
    const markup = renderView(
      readyState,
      { route: 'reports' },
      {
        ...INITIAL_H2_COMMAND_STATE,
        artifact: {
          descriptor: H2_FIXTURE_REPORT_DESCRIPTOR,
          mediaType: 'text/html',
          content: '<main>Fixture report</main>',
        },
      },
    )

    assert.match(markup, new RegExp(H2_FIXTURE_REPORT_DESCRIPTOR.contentHash))
  })
})

function renderView(
  workspaceState: H2WorkspaceState,
  navigation: H2NavigationTarget,
  commandState = INITIAL_H2_COMMAND_STATE,
): string {
  return renderToStaticMarkup(
    <H2SentinelView
      commandState={commandState}
      navigation={navigation}
      onAsk={noop}
      onDownload={noop}
      onExport={noop}
      onImport={noop}
      onNavigate={noop}
      onRetry={noop}
      workspaceState={workspaceState}
    />,
  )
}
