import { useEffect, useRef } from 'react'
import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([
  LineChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

export interface EChartsCanvasProps {
  readonly ariaLabel: string
  readonly className?: string
  readonly option: EChartsCoreOption
}

/** Small feature-local ECharts lifecycle wrapper; page components stay chart-library agnostic. */
export function EChartsCanvas({ ariaLabel, className = '', option }: EChartsCanvasProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) {
      return
    }

    const chart = init(element, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const resize = (): void => chart.resize()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)

    observer?.observe(element)
    window.addEventListener('resize', resize)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    chartRef.current?.setOption(
      {
        ...option,
        animation: !prefersReducedMotion,
      },
      { notMerge: true },
    )
  }, [option])

  return (
    <div
      aria-label={ariaLabel}
      className={`h2-chart ${className}`.trim()}
      ref={elementRef}
      role="img"
    />
  )
}
