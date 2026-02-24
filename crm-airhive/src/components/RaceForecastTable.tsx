'use client'

import { BarChart3, Calculator } from 'lucide-react'
import { rankRaceItems } from '@/lib/raceRanking'

type ForecastSellerRow = {
    name: string
    forecastValue: number
    activeNegotiationLeads: number
    reliability?: number
}

interface RaceForecastTableProps {
    sellers: ForecastSellerRow[]
    title?: string
    subtitle?: string
}

export default function RaceForecastTable({
    sellers,
    title = 'Pronóstico de Carrera',
    subtitle = 'Valor estimado × probabilidad en leads activos (Negociación)'
}: RaceForecastTableProps) {
    const ranked = rankRaceItems(sellers, (s) => s.forecastValue)

    return (
        <div className='rounded-[32px] border shadow-sm overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='px-6 py-4 border-b flex items-center justify-between gap-4' style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                <div>
                    <h3 className='text-[11px] font-black uppercase tracking-[0.18em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                        <BarChart3 size={14} className='text-[#2048FF]' />
                        {title}
                    </h3>
                    <p className='text-[10px] font-bold mt-1' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                        {subtitle}
                    </p>
                </div>
                <div className='px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5'
                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                    title='Esta tabla es una proyección, no dinero cerrado real'
                >
                    <Calculator size={11} className='text-[#2048FF]' />
                    Pronóstico
                </div>
            </div>

            <div className='p-4 space-y-2'>
                {ranked.map((entry) => {
                    const seller = entry.item
                    return (
                        <div
                            key={seller.name}
                            className='grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border px-3 py-2.5'
                            style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                        >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${entry.medal === 'gold'
                                ? 'bg-amber-500/20 text-amber-600'
                                : entry.medal === 'silver'
                                    ? 'bg-slate-500/20 text-slate-500'
                                    : entry.medal === 'bronze'
                                        ? 'bg-orange-500/20 text-orange-600'
                                        : 'bg-gray-500/10 text-gray-500'
                                }`}>
                                {entry.rank}
                            </div>
                            <div className='min-w-0'>
                                <p className='text-sm font-black truncate' style={{ color: 'var(--text-primary)' }}>{seller.name}</p>
                                <p className='text-[10px] font-bold uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                                    {seller.activeNegotiationLeads} leads en negociación
                                </p>
                            </div>
                            <div className='text-right'>
                                <p className='text-xs font-black text-[#1700AC]'>
                                    ${Math.round(seller.forecastValue).toLocaleString('es-MX')}
                                </p>
                                {typeof seller.reliability === 'number' && (
                                    <p className='text-[9px] font-bold uppercase' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                        Conf. {seller.reliability.toFixed(0)}%
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
                {ranked.length === 0 && (
                    <div className='rounded-2xl border px-4 py-6 text-center'
                        style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                        <p className='text-sm font-bold'>Sin leads activos para pronóstico</p>
                    </div>
                )}
            </div>
        </div>
    )
}
