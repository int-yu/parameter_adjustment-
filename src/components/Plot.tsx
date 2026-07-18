import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface PlotSeries {
  label: string
  color: string
  values: Array<number | null>
  scale?: string
}

interface PlotProps {
  title: string
  x: number[]
  series: PlotSeries[]
  height?: number
}

export function Plot({ title, x, series, height = 260 }: PlotProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const build = () => {
      plotRef.current?.destroy()
      const width = Math.max(320, host.clientWidth)
      const uniqueScales = Array.from(new Set(series.map((item) => item.scale ?? 'value')))
      plotRef.current = new uPlot({
        width,
        height,
        title,
        cursor: { drag: { x: true, y: false } },
        legend: { show: true },
        scales: Object.fromEntries(uniqueScales.map((scale) => [scale, { auto: true }])),
        axes: [
          { stroke: '#68736d', grid: { stroke: '#e1e6e2' } },
          ...uniqueScales.map((scale, index) => ({
            scale,
            side: index % 2 === 0 ? 3 : 1,
            stroke: '#68736d',
            grid: { show: index === 0, stroke: '#e1e6e2' },
          })),
        ],
        series: [
          {},
          ...series.map((item) => ({
            label: item.label,
            stroke: item.color,
            width: 2,
            scale: item.scale ?? 'value',
            points: { show: false },
          })),
        ],
      }, [x, ...series.map((item) => item.values)] as uPlot.AlignedData, host)
    }
    build()
    const observer = new ResizeObserver(build)
    observer.observe(host)
    return () => {
      observer.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [height, series, title, x])

  return <div className="plot-host" ref={hostRef} aria-label={title} />
}
