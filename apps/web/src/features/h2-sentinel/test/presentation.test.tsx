import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  H2_FIXTURE_REPORT_DESCRIPTOR,
  type H2AnomalyEvent,
} from '@opendashboard/h2-contracts'
import { H2SentinelView } from '../H2SentinelView.tsx'
import {
  INITIAL_H2_COMMAND_STATE,
  INITIAL_H2_REVIEW_COMMAND_STATE,
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
      [{ route: 'assistant' }, '十个官方问题'],
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

  it('makes the judge path, C01-C07 coverage, source identity, and sign conventions visible', () => {
    const overviewMarkup = renderView(readyState, { route: 'overview' })
    assert.match(overviewMarkup, /一条路径完成核验、复核与导出/)
    assert.match(overviewMarkup, /数据源 \/ 导入/)
    assert.match(overviewMarkup, /证据链/)
    assert.match(overviewMarkup, /人工复核/)
    assert.match(overviewMarkup, /Q01–Q10 助手/)
    assert.match(overviewMarkup, /报告 \/ 提交导出/)
    assert.match(overviewMarkup, new RegExp(H2_WEB_FIXTURE_RUN.dataset.sourceFilename))
    assert.match(overviewMarkup, new RegExp(H2_WEB_FIXTURE_RUN.dataset.fingerprint))
    assert.match(overviewMarkup, /无控制权限/)
    for (const code of ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07']) {
      assert.match(overviewMarkup, new RegExp(code))
    }
    assert.match(overviewMarkup, /PCC.*正值上网（送出），负值下网（受电）/s)
    assert.match(overviewMarkup, /储能.*正值放电，负值充电/s)

    const analysisMarkup = renderView(readyState, { route: 'analysis' })
    assert.match(analysisMarkup, /符号约定/)
    assert.match(analysisMarkup, /正值上网（送出），负值下网（受电）/)
    assert.match(analysisMarkup, /正值放电，负值充电/)
  })

  it('blocks downstream judge steps when the data-quality gate is blocked', () => {
    const blockedState: H2WorkspaceState = {
      status: 'ready',
      workspace: {
        ...readyState.workspace,
        run: {
          ...H2_WEB_FIXTURE_RUN,
          quality: {
            ...H2_WEB_FIXTURE_RUN.quality,
            status: 'blocked',
            blockingReasons: ['缺少官方必填字段'],
          },
        },
      },
    }
    const markup = renderView(blockedState, { route: 'overview' })
    assert.match(markup, /质量门禁已阻断后续分析/)
    assert.match(markup, /缺少官方必填字段/)
    assert.match(markup, /暂不可用/)
    assert.match(markup, /disabled=""/)
    assert.match(markup, /未生成替代事件或推测结论/)
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
      onReloadReview={noop}
      onRetry={noop}
      onReview={noop}
      onSelectEvent={noop}
      reviewState={INITIAL_H2_REVIEW_COMMAND_STATE}
      selectedEventId={navigation.eventId ?? null}
      workspaceState={workspaceState}
    />,
  )
}
