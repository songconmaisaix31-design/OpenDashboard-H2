import { lazy, Suspense } from 'react'
import type { EChartsCoreOption } from 'echarts/core'

const LazyEChartsCanvasRuntime = lazy(async () => {
  const module = await import('./EChartsCanvasRuntime.tsx')
  return { default: module.EChartsCanvasRuntime }
})

export interface EChartsCanvasProps {
  readonly ariaLabel: string
  readonly className?: string
  readonly option: EChartsCoreOption
}

/** Keeps the application shell interactive while the chart runtime loads on demand. */
export function EChartsCanvas({ ariaLabel, className = '', option }: EChartsCanvasProps) {
  const fallback = (
    <div
      aria-label={`${ariaLabel}正在加载`}
      className={`h2-chart h2-chart--loading ${className}`.trim()}
      role="status"
    >
      <span>正在加载本地图表…</span>
    </div>
  )
  if (typeof window === 'undefined') return fallback

  return (
    <Suspense fallback={fallback}>
      <LazyEChartsCanvasRuntime
        ariaLabel={ariaLabel}
        className={className}
        option={option}
      />
    </Suspense>
  )
}
