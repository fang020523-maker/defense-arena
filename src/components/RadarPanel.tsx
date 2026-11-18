/**
 * 五维评分雷达（ECharts）：各评委 + 委员会平均
 */
import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import { getAgent } from '../agents/roles'
import { useDefense } from '../store/useDefense'
import { SCORE_DIMS } from '../types'
import { ACCENT } from './ui'

export function RadarPanel({ height = 300 }: { height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const scores = useDefense((s) => s.scores)
  const radar = useDefense((s) => s.radar)

  useEffect(() => {
    if (!ref.current) return
    chartRef.current = echarts.init(ref.current)
    const observer = new ResizeObserver(() => chartRef.current?.resize())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const indicators = SCORE_DIMS.map(({ label }) => ({
      name: label,
      max: 100,
    }))

    const seriesData: Record<string, unknown>[] = []
    for (const s of scores) {
      const agent = getAgent(s.judgeId)
      const hex = ACCENT[agent.accent].hex
      seriesData.push({
        name: agent.name,
        value: SCORE_DIMS.map(({ key }) => s.scores[key]),
        lineStyle: { color: hex, width: 1.5, opacity: 0.7 },
        itemStyle: { color: hex },
        symbolSize: 4,
      })
    }
    if (radar) {
      seriesData.push({
        name: '委员会平均',
        value: SCORE_DIMS.map(({ key }) => radar[key]),
        lineStyle: { color: '#22d3ee', width: 2.5 },
        itemStyle: { color: '#22d3ee' },
        symbolSize: 6,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(34,211,238,0.35)' },
            { offset: 1, color: 'rgba(167,139,250,0.08)' },
          ]),
        },
      })
    }

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: '#0f1830', borderColor: '#1f2c4d', textStyle: { color: '#dce8ff', fontSize: 12 } },
      legend: {
        bottom: 0,
        textStyle: { color: '#8da2c7', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 8,
      },
      radar: {
        indicator: indicators,
        center: ['50%', '48%'],
        radius: '62%',
        axisName: { color: '#dce8ff', fontSize: 12 },
        splitLine: { lineStyle: { color: 'rgba(31,44,77,0.9)' } },
        splitArea: { areaStyle: { color: ['rgba(15,24,48,0.25)', 'rgba(11,17,32,0.25)'] } },
        axisLine: { lineStyle: { color: 'rgba(31,44,77,0.9)' } },
      },
      series: [{ type: 'radar', data: seriesData }],
    })
  }, [scores, radar])

  return <div ref={ref} style={{ width: '100%', height }} />
}
