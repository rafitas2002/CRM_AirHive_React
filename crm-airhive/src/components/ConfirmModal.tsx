'use client'

interface ConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => Promise<void> | void
    title: string
    message: string
    isDestructive?: boolean
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    isDestructive = false
}: ConfirmModalProps) {
    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity'>
            <div className='w-full max-w-sm bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl transform transition-all overflow-hidden flex flex-col'>
                {/* Header */}
                <div className='bg-[#0A1635] px-6 py-4 flex items-center justify-between shrink-0 border-b border-[var(--card-border)]'>
                    <h2 className='text-lg font-bold text-white'>
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className='text-white/70 hover:text-white transition-colors'
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className='p-6 text-center space-y-4'>
                    <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${isDestructive ? 'bg-red-100' : 'bg-blue-100'}`}>
                        {isDestructive ? (
                            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        ) : (
                            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                            </svg>
                        )}
                    </div>
                    <p className='text-[var(--text-secondary)] text-sm leading-relaxed'>
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className='bg-[var(--hover-bg)] px-6 py-4 flex items-center justify-center gap-3 shrink-0 border-t border-[var(--card-border)]'>
                    <button
                        onClick={onClose}
                        className='w-full px-4 py-2 text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)] transition-colors bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow-sm hover:shadow hover:border-[var(--text-secondary)]'
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            onConfirm()
                            onClose()
                        }}
                        className={`w-full px-4 py-2 text-white font-medium rounded-lg shadow-md transition-all transform active:scale-95 ${isDestructive
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-[#2048FF] hover:bg-[#1700AC]'
                            }`}
                    >
                        {isDestructive ? 'Eliminar' : 'Aceptar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
