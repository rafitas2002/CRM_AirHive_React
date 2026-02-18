'use client'

import { useMemo, useState } from 'react'

type CorrelationRow = {
    name: string
    tenureMonths: number
    totalSales: number
    forecastAccuracy: number
    meetingsPerClose: number
}

type Props = {
    rows: CorrelationRow[]
    title?: string
    subtitle?: string
}

type MetricKey = 'tenureMonths' | 'totalSales' | 'forecastAccuracy' | 'meetingsPerClose'

const METRICS: Array<{ key: MetricKey, label: string }> = [
    { key: 'tenureMonths', label: 'Antigüedad (meses)' },
    { key: 'totalSales', label: 'Ventas Totales' },
    { key: 'forecastAccuracy', label: 'Forecast Accuracy (%)' },
    { key: 'meetingsPerClose', label: 'Meetings por Cierre' }
]

function pearson(values: Array<{ x: number, y: number }>) {
    const valid = values.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y))
    const n = valid.length
    if (n < 2) return 0

    const sumX = valid.reduce((acc, v) => acc + v.x, 0)
    const sumY = valid.reduce((acc, v) => acc + v.y, 0)
    const sumXY = valid.reduce((acc, v) => acc + (v.x * v.y), 0)
    const sumX2 = valid.reduce((acc, v) => acc + (v.x * v.x), 0)
    const sumY2 = valid.reduce((acc, v) => acc + (v.y * v.y), 0)

    const numerator = (n * sumXY) - (sumX * sumY)
    const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)))

    if (!Number.isFinite(denominator) || denominator === 0) return 0
    return numerator / denominator
}

export default function CorrelationScatterWindow({ rows, title, subtitle }: Props) {
    const [xMetric, setXMetric] = useState<MetricKey>('tenureMonths')
    const [yMetric, setYMetric] = useState<MetricKey>('totalSales')

    const chart = useMemo(() => {
        const points = rows
            .map((r) => ({
                name: r.name,
                x: Number(r[xMetric] ?? 0),
                y: Number(r[yMetric] ?? 0)
            }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

        const maxX = Math.max(1, ...points.map((p) => p.x))
        const maxY = Math.max(1, ...points.map((p) => p.y))

        const normalized = points.map((p) => ({
            ...p,
            xPct: Math.max(4, Math.min(96, (p.x / maxX) * 100)),
            yPct: Math.max(4, Math.min(96, 100 - ((p.y / maxY) * 100)))
        }))

        return {
            points: normalized,
            r: pearson(points)
        }
    }, [rows, xMetric, yMetric])

    return (
        <div className='rounded-[32px] border p-6 md:p-8' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='flex items-start justify-between gap-4 mb-5'>
                <div>
                    <h3 className='text-lg font-black' style={{ color: 'var(--text-primary)' }}>{title || 'Gráfica de Correlaciones'}</h3>
                    <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                        {subtitle || 'Selecciona variables para analizar la relación'}
                    </p>
                </div>

                <div className='flex items-center gap-2'>
                    <select
                        value={xMetric}
                        onChange={(e) => setXMetric(e.target.value as MetricKey)}
                        className='bg-transparent px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border'
                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                    >
                        {METRICS.map((m) => (
                            <option key={m.key} value={m.key}>{`X: ${m.label}`}</option>
                        ))}
                    </select>
                    <select
                        value={yMetric}
                        onChange={(e) => setYMetric(e.target.value as MetricKey)}
                        className='bg-transparent px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border'
                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                    >
                        {METRICS.map((m) => (
                            <option key={m.key} value={m.key}>{`Y: ${m.label}`}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className='relative h-72 rounded-2xl border overflow-hidden' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                {chart.points.map((p) => (
                    <div
                        key={`${p.name}-${p.x}-${p.y}`}
                        title={`${p.name}: ${p.x.toFixed(2)} / ${p.y.toFixed(2)}`}
                        className='absolute w-3.5 h-3.5 rounded-full bg-[#2048FF] border border-white shadow'
                        style={{ left: `${p.xPct}%`, top: `${p.yPct}%`, transform: 'translate(-50%, -50%)' }}
                    />
                ))}
                <div className='absolute left-3 bottom-2 text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                    {METRICS.find((m) => m.key === xMetric)?.label}
                </div>
                <div className='absolute right-3 top-2 text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                    {METRICS.find((m) => m.key === yMetric)?.label}
                </div>
            </div>

            <div className='mt-4 rounded-xl border px-4 py-3' style={{ borderColor: 'var(--card-border)' }}>
                <p className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Correlación actual (Pearson)</p>
                <p className='text-2xl font-black' style={{ color: Math.abs(chart.r) >= 0.5 ? '#10b981' : (Math.abs(chart.r) >= 0.25 ? '#f59e0b' : 'var(--text-primary)') }}>
                    r = {chart.r.toFixed(2)}
                </p>
            </div>
        </div>
    )
}
