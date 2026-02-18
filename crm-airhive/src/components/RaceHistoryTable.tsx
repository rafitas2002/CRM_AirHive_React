'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Trophy, Medal, RefreshCw, Pencil, Save, X } from 'lucide-react'
import { getPastRaces, overrideRaceResult, recalculateRacePeriod } from '@/app/actions/race'

interface RaceResult {
    id: string
    period: string
    title: string
    user_id: string
    name: string
    total_sales: number
    rank: number
    medal: 'gold' | 'silver' | 'bronze' | null
}

interface RaceHistoryTableProps {
    races: Record<string, RaceResult[]>
}

export function RaceHistoryTable({ races }: RaceHistoryTableProps) {
    const [localRaces, setLocalRaces] = useState<Record<string, RaceResult[]>>(races)
    const [loadingPeriod, setLoadingPeriod] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editRank, setEditRank] = useState<number>(4)
    const [editMedal, setEditMedal] = useState<'gold' | 'silver' | 'bronze' | 'none'>('none')
    const [editTotalSales, setEditTotalSales] = useState<number>(0)
    const [editNote, setEditNote] = useState<string>('')

    useEffect(() => {
        setLocalRaces(races)
    }, [races])

    const periods = useMemo(() => Object.keys(localRaces).sort((a, b) => b.localeCompare(a)), [localRaces])

    const refreshHistory = async () => {
        const res = await getPastRaces()
        if (res.success && res.data) setLocalRaces(res.data as Record<string, RaceResult[]>)
    }

    const handleRecalculate = async (period: string) => {
        setLoadingPeriod(period)
        const res = await recalculateRacePeriod(period)
        if (!res.success) alert(`No se pudo recalcular ${period}: ${res.error}`)
        await refreshHistory()
        setLoadingPeriod(null)
    }

    const startEdit = (row: RaceResult) => {
        setEditingId(row.id)
        setEditRank(row.rank)
        setEditMedal(row.medal || 'none')
        setEditTotalSales(Number(row.total_sales || 0))
        setEditNote('')
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditNote('')
    }

    const saveEdit = async () => {
        if (!editingId) return
        const res = await overrideRaceResult({
            resultId: editingId,
            rank: Math.max(1, Number(editRank || 1)),
            medal: editMedal === 'none' ? null : editMedal,
            totalSales: Math.max(0, Number(editTotalSales || 0)),
            note: editNote
        })
        if (!res.success) {
            alert(`No se pudo guardar la corrección: ${res.error}`)
            return
        }
        setEditingId(null)
        setEditNote('')
        await refreshHistory()
    }

    if (periods.length === 0) {
        return (
            <div className="text-center p-8 rounded-xl border border-dashed transition-all" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                <p className="font-bold uppercase text-[10px] tracking-widest" style={{ color: 'var(--text-secondary)' }}>No hay historial de carreras todavía.</p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {periods.map((period) => {
                const results = localRaces[period]
                const title = results[0]?.title || `Carrera de ${period}`

                return (
                    <div key={period} className="rounded-2xl border overflow-hidden transition-all duration-500" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                            <h3 className="text-lg font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Trophy className="w-5 h-5 text-yellow-500" />
                                {title}
                            </h3>
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-auto" style={{ color: 'var(--text-secondary)' }}>
                                {period}
                            </span>
                            <button
                                onClick={() => handleRecalculate(period)}
                                disabled={loadingPeriod === period}
                                className="ml-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90"
                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loadingPeriod === period ? 'animate-spin' : ''}`} />
                                {loadingPeriod === period ? 'Recalculando...' : 'Recalcular Mes'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b" style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Rango</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Vendedor</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Ventas Totales</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Medalla</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
                                    {results.map((res) => (
                                        <tr key={res.user_id} className="hover:bg-[var(--hover-bg)] transition-colors">
                                            <td className="px-6 py-4">
                                                <span className={`
                                                    inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
                                                    ${res.rank === 1 ? 'bg-yellow-500/20 text-yellow-500' :
                                                        res.rank === 2 ? 'bg-slate-300/20 text-slate-300' :
                                                            res.rank === 3 ? 'bg-amber-700/20 text-amber-700' :
                                                                'text-slate-500'}
                                                `}>
                                                    {res.rank}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-bold" style={{ color: 'var(--text-primary)' }}>
                                                {res.name}
                                            </td>
                                            <td className="px-6 py-4 font-black" style={{ color: 'var(--text-primary)' }}>
                                                {editingId === res.id ? (
                                                    <input
                                                        type="number"
                                                        value={editTotalSales}
                                                        min={0}
                                                        onChange={(e) => setEditTotalSales(Number(e.target.value))}
                                                        className="w-40 rounded-lg border px-2 py-1 text-sm font-black"
                                                        style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                    />
                                                ) : (
                                                    <>${res.total_sales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {editingId === res.id ? (
                                                    <select
                                                        value={editMedal}
                                                        onChange={(e) => setEditMedal(e.target.value as 'gold' | 'silver' | 'bronze' | 'none')}
                                                        className="rounded-lg border px-2 py-1 text-xs font-black uppercase"
                                                        style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                    >
                                                        <option value="none">Sin medalla</option>
                                                        <option value="gold">Oro</option>
                                                        <option value="silver">Plata</option>
                                                        <option value="bronze">Bronce</option>
                                                    </select>
                                                ) : res.medal && (
                                                    <div className="flex items-center gap-1">
                                                        <Medal className={`w-5 h-5 ${res.medal === 'gold' ? 'text-yellow-500' :
                                                            res.medal === 'silver' ? 'text-slate-300' :
                                                                'text-amber-700'
                                                            }`} />
                                                        <span className="text-xs capitalize text-slate-400">
                                                            {res.medal === 'gold' ? 'Oro' : res.medal === 'silver' ? 'Plata' : 'Bronce'}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {editingId === res.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={editRank}
                                                            min={1}
                                                            onChange={(e) => setEditRank(Number(e.target.value))}
                                                            className="w-16 rounded-lg border px-2 py-1 text-sm font-black"
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editNote}
                                                            placeholder="Motivo de corrección"
                                                            onChange={(e) => setEditNote(e.target.value)}
                                                            className="w-40 rounded-lg border px-2 py-1 text-xs font-bold"
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                        />
                                                        <button onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-black uppercase" style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}>
                                                            <Save className="w-3.5 h-3.5" />
                                                            Guardar
                                                        </button>
                                                        <button onClick={cancelEdit} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-black uppercase" style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEdit(res)}
                                                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-black uppercase transition-all hover:opacity-90"
                                                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                        Corregir
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
