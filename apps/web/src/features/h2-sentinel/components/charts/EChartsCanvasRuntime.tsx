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
import { init, use, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

import type { EChartsCanvasProps } from './EChartsCanvas.tsx'

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

/** Browser-only ECharts lifecycle; imported through the lightweight Suspense boundary. */
export function EChartsCanvasRuntime({
  ariaLabel,
  className = '',
  option,
}: EChartsCanvasProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const chart = init(element, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resize = (): void => chart.resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
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
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    chartRef.current?.setOption(
      { ...option, animation: !prefersReducedMotion },
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
