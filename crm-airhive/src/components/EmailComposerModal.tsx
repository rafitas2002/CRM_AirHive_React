'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { sendGoogleEmailAction } from '@/app/actions/google-integration'

interface EmailComposerModalProps {
    isOpen: boolean
    onClose: () => void
    recipientEmail: string
    recipientName?: string
}

export default function EmailComposerModal({
    isOpen,
    onClose,
    recipientEmail,
    recipientName
}: EmailComposerModalProps) {
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSending(true)
        setStatus('idle')

        try {
            const result = await sendGoogleEmailAction(recipientEmail, subject, body)

            if (result.success) {
                setStatus('success')
                setTimeout(() => {
                    onClose()
                    // Reset state after closing
                    setSubject('')
                    setBody('')
                    setStatus('idle')
                }, 2000)
            } else {
                throw new Error(result.error || 'Error al enviar el correo')
            }
        } catch (error: any) {
            console.error('Error sending email:', error)
            setStatus('error')
            setErrorMessage(error.message || 'Error al enviar el correo')
        } finally {
            setIsSending(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all animate-in fade-in duration-200'>
            <div className='bg-white rounded-[32px] w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200'>
                {/* Header */}
                <div className='bg-[#0A1635] p-8 shrink-0 flex items-center justify-between'>
                    <div>
                        <h2 className='text-2xl font-black text-white tracking-tight'>Redactar Correo</h2>
                        <p className='text-blue-300 text-[10px] font-black uppercase tracking-widest mt-1'>Enviando desde tu cuenta de AirHive</p>
                    </div>
                    <button onClick={onClose} className='w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all font-bold'>✕</button>
                </div>

                {/* Form */}
                <form onSubmit={handleSend} className='p-8 space-y-6 overflow-y-auto custom-scrollbar'>
                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Para</label>
                        <div className='px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-[#0A1635] flex items-center gap-2'>
                            <span className='text-xs'>{recipientName || recipientEmail}</span>
                            <span className='text-[10px] text-gray-400 font-medium'>({recipientEmail})</span>
                        </div>
                    </div>

                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Asunto</label>
                        <input
                            required
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] transition-all text-xs'
                            placeholder="Introduce el asunto del correo..."
                        />
                    </div>

                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Mensaje</label>
                        <textarea
                            required
                            rows={10}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-xs text-[#0A1635] transition-all resize-none'
                            placeholder="Escribe tu mensaje aquí..."
                        />
                    </div>

                    {status === 'error' && (
                        <div className='p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2'>
                            <span className='text-red-500 font-bold'>⚠️</span>
                            <p className='text-xs text-red-600 font-black uppercase tracking-tight'>{errorMessage}</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className='p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2'>
                            <span className='text-emerald-500 font-bold'>✓</span>
                            <p className='text-xs text-emerald-600 font-black uppercase tracking-tight'>¡Correo enviado con éxito!</p>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className='p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-4 shrink-0'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-6 py-2.5 rounded-xl font-black text-gray-500 hover:bg-gray-100 transition-all uppercase text-[10px] tracking-widest'
                    >
                        Cancelar
                    </button>
                    <button
                        type='submit'
                        disabled={isSending || status === 'success'}
                        className='px-10 py-2.5 bg-[#2048FF] text-white rounded-xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95 uppercase text-[10px] tracking-widest flex items-center gap-2 disabled:opacity-50'
                    >
                        {isSending ? (
                            <>
                                <div className='w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
                                Enviando...
                            </>
                        ) : (
                            <>
                                <span>📧</span> Enviar Correo
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
