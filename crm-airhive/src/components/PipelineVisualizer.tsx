'use client'

interface FunnelData {
    stage: string
    count: number
    value: number
    color: string
}

interface PipelineVisualizerProps {
    data: FunnelData[]
}

export default function PipelineVisualizer({ data }: PipelineVisualizerProps) {
    const totalLeads = data.reduce((acc, d) => acc + d.count, 0)
    const totalValue = data.reduce((acc, d) => acc + d.value, 0)
    const maxCount = Math.max(1, ...data.map(d => d.count))
    const activeLeads = data
        .filter((d) => d.stage === 'Prospección' || d.stage === 'Negociación')
        .reduce((acc, d) => acc + d.count, 0)
    const closedWon = data.find((d) => d.stage === 'Cerrado Ganado')?.count || 0
    const winRate = activeLeads > 0 ? (closedWon / activeLeads) * 100 : 0

    return (
        <div className='p-8 rounded-3xl border shadow-sm h-full flex flex-col' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='mb-6'>
                <h3 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Embudo de Pipeline</h3>
                <p className='text-xs font-medium mt-1 uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Distribución por etapa de venta</p>
            </div>

            <div className='flex-1 flex flex-col gap-5'>
                {data.map((item, index) => {
                    const widthPercent = Math.max(12, (item.count / maxCount) * 100)
                    const conversion = index > 0 && data[index - 1].count > 0
                        ? (item.count / data[index - 1].count) * 100
                        : null
                    const stageColor = getStageColor(item.stage)
                    const rowAccent = `linear-gradient(90deg, ${stageColor}22 0%, transparent 70%)`

                    return (
                        <div key={item.stage} className='rounded-2xl border p-4 transition-all hover:shadow-md' style={{ borderColor: 'var(--card-border)', background: rowAccent }}>
                            <div className='flex items-center justify-between gap-3 mb-2'>
                                <div className='flex items-center gap-2'>
                                    <span className='w-2.5 h-2.5 rounded-full' style={{ background: stageColor }} />
                                    <span className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>{item.stage}</span>
                                </div>
                                <div className='text-right'>
                                    <p className='text-[10px] font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>${item.value.toLocaleString('es-MX')}</p>
                                    {conversion !== null && (
                                        <p className='text-[9px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                            Conv. {conversion.toFixed(0)}%
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className='relative h-12 rounded-xl border overflow-hidden' style={{ borderColor: `${stageColor}66`, background: 'var(--hover-bg)' }}>
                                <div
                                    className='absolute inset-y-0 left-0 rounded-xl transition-all duration-700'
                                    style={{
                                        width: `${widthPercent}%`,
                                        background: `linear-gradient(90deg, ${stageColor}CC 0%, ${stageColor}66 100%)`
                                    }}
                                />
                                <div className='absolute inset-0 px-4 flex items-center justify-between'>
                                    <div
                                        className='px-2.5 py-1 rounded-lg border text-sm font-black tabular-nums'
                                        style={{ color: 'var(--text-primary)', borderColor: `${stageColor}66`, background: 'var(--card-bg)' }}
                                    >
                                        {item.count}
                                    </div>
                                    <span className='text-[9px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        {item.count > 0 ? `$${Math.round(item.value / item.count).toLocaleString('es-MX')} por lead` : 'Sin leads'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className='mt-8 pt-4 border-t flex justify-between items-end' style={{ borderColor: 'var(--card-border)' }}>
                <div>
                    <label className='text-[8px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Total Leads</label>
                    <p className='text-xl font-black' style={{ color: 'var(--text-primary)' }}>{totalLeads}</p>
                </div>
                <div className='text-right'>
                    <label className='text-[8px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Valor Total</label>
                    <p className='text-xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>${totalValue.toLocaleString('es-MX')}</p>
                </div>
                <div className='text-right'>
                    <label className='text-[8px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Tasa de Cierre</label>
                    <p className='text-xs font-black uppercase' style={{ color: getKpiColor(winRate) }}>{winRate.toFixed(1)}%</p>
                </div>
            </div>
        </div>
    )
}

function getStageColor(stage: string) {
    const normalized = stage.toLowerCase()
    if (normalized.includes('ganado')) return '#10b981'
    if (normalized.includes('perdido')) return '#ef4444'
    if (normalized.includes('negoci')) return '#3b82f6'
    return '#8b5cf6'
}

function getKpiColor(value: number) {
    if (value >= 40) return '#10b981'
    if (value >= 20) return '#f59e0b'
    return '#ef4444'
}
