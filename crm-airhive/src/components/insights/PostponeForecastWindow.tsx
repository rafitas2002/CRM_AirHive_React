'use client'

import { useMemo, useState } from 'react'

type Row = {
    size: number
    totalMeetings: number
    postponedMeetings: number
    heldMeetings: number
    postponeProbability: number
}

type Props = {
    rows: Row[]
    title?: string
    subtitle?: string
}

export default function PostponeForecastWindow({ rows, title, subtitle }: Props) {
    const [selectedSize, setSelectedSize] = useState<number>(5)

    const selected = useMemo(() => {
        return rows.find((r) => r.size === selectedSize) || null
    }, [rows, selectedSize])

    return (
        <div className='rounded-[32px] border p-6 md:p-8' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='flex items-start justify-between gap-4 mb-5'>
                <div>
                    <h3 className='text-lg font-black' style={{ color: 'var(--text-primary)' }}>{title || 'Pronóstico de Posposición de Juntas'}</h3>
                    <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                        {subtitle || 'Basado en histórico por tamaño de empresa'}
                    </p>
                </div>
                <select
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(Number(e.target.value))}
                    className='bg-transparent px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border'
                    style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                >
                    {[1, 2, 3, 4, 5].map((size) => (
                        <option key={size} value={size}>{`Tamaño ${size}`}</option>
                    ))}
                </select>
            </div>

            {selected && (
                <div className='mb-5 rounded-2xl border p-4' style={{ borderColor: 'var(--card-border)' }}>
                    <p className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                        Probabilidad estimada para empresa tamaño {selected.size}
                    </p>
                    <p className='text-3xl font-black' style={{ color: '#2048FF' }}>
                        {Number(selected.postponeProbability || 0).toFixed(1)}%
                    </p>
                    <p className='text-[11px] font-bold mt-1' style={{ color: 'var(--text-secondary)' }}>
                        {selected.postponedMeetings} de {selected.totalMeetings} juntas terminaron no realizadas/canceladas.
                    </p>
                </div>
            )}

            <div className='space-y-3'>
                {rows.map((row) => (
                    <div key={row.size} className='rounded-xl border p-3' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center justify-between mb-2'>
                            <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>{`Tamaño ${row.size}`}</p>
                            <p className='text-sm font-black' style={{ color: '#2048FF' }}>{Number(row.postponeProbability || 0).toFixed(1)}%</p>
                        </div>
                        <div className='h-2 rounded-full overflow-hidden' style={{ background: 'var(--background)' }}>
                            <div
                                className='h-full bg-gradient-to-r from-amber-500 to-red-500'
                                style={{ width: `${Math.max(0, Math.min(100, Number(row.postponeProbability || 0)))}%` }}
                            />
                        </div>
                        <p className='mt-2 text-[10px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>
                            Held: {row.heldMeetings} · Postergadas/canceladas: {row.postponedMeetings} · Total: {row.totalMeetings}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
