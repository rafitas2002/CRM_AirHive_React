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
    const maxValue = Math.max(...data.map(d => d.value))

    return (
        <div className='bg-white p-8 rounded-3xl border border-gray-100 shadow-sm h-full flex flex-col'>
            <div className='mb-8'>
                <h3 className='text-xl font-black text-[#0A1635] tracking-tight'>Embudo de Pipeline</h3>
                <p className='text-xs text-gray-400 font-medium mt-1 uppercase tracking-widest'>Distribución por etapa de venta</p>
            </div>

            <div className='flex-1 flex flex-col justify-between gap-4'>
                {data.map((item, index) => {
                    // Logic for funnel shape
                    const widthPercent = 100 - (index * 15)

                    return (
                        <div key={item.stage} className='flex items-center gap-4 group'>
                            <div className='w-full'>
                                <div className='flex justify-between items-center mb-1 px-2'>
                                    <span className='text-[10px] font-black text-[#0A1635] uppercase'>{item.stage}</span>
                                    <span className='text-[10px] font-black text-gray-400'>${item.value.toLocaleString()}</span>
                                </div>
                                <div className='relative h-12 flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-[1.02] cursor-default'>
                                    <div
                                        className='h-full rounded-2xl'
                                        style={{
                                            width: `${widthPercent}%`,
                                            backgroundColor: item.color,
                                            opacity: 0.15
                                        }}
                                    />
                                    <div
                                        className='absolute h-full rounded-2xl flex items-center px-6 justify-between'
                                        style={{ width: `${widthPercent}%` }}
                                    >
                                        <span className='text-lg font-black' style={{ color: item.color }}>{item.count}</span>
                                        <div className='flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity'>
                                            <span className='text-[8px] font-black uppercase tracking-widest' style={{ color: item.color }}>Promedios</span>
                                            <span className='text-[10px] font-bold' style={{ color: item.color }}>${(item.value / (item.count || 1)).toLocaleString()} / lead</span>
                                        </div>
                                    </div>
                                    {/* Decoration border */}
                                    <div
                                        className='absolute inset-0 rounded-2xl border-2'
                                        style={{
                                            width: `${widthPercent}%`,
                                            borderColor: item.color,
                                            opacity: 0.3
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className='mt-8 pt-4 border-t border-gray-50 flex justify-between items-end'>
                <div>
                    <label className='text-[8px] font-black text-gray-400 uppercase tracking-widest'>Total Leads</label>
                    <p className='text-xl font-black text-[#0A1635]'>{totalLeads}</p>
                </div>
                <div className='text-right'>
                    <label className='text-[8px] font-black text-gray-400 uppercase tracking-widest'>Salud del Embudo</label>
                    <p className='text-xs font-bold text-emerald-500 uppercase'>Óptimo</p>
                </div>
            </div>
        </div>
    )
}
