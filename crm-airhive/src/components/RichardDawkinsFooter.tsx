'use client'

import { useMemo } from 'react'

export default function RichardDawkinsFooter() {
    const dawkinsQuotes = useMemo(() => [
        "Science is the poetry of reality.",
        "We are going to die, and that makes us the lucky ones. Most people are never going to die because they are never going to be born.",
        "The feeling of awed wonder that science can give us is one of the highest experiences of which the human psyche is capable.",
        "Nature is not cruel, only pitilessly indifferent. This is one of the hardest lessons for humans to learn.",
        "Cumulative selection is the key to understanding the complexity of life.",
        "The universe we observe has precisely the properties we should expect if there is, at bottom, no design, no purpose, no evil, no good, nothing but pitiless indifference."
    ], [])

    const randomQuote = useMemo(() => {
        return dawkinsQuotes[Math.floor(Math.random() * dawkinsQuotes.length)]
    }, [dawkinsQuotes])

    return (
        <div className='flex flex-col items-center justify-center gap-6 select-none mt-12 mb-24'>
            <div className='w-32 h-1 bg-gradient-to-r from-transparent via-blue-600 to-transparent rounded-full opacity-30' />
            <div className='max-w-3xl px-8 text-center group'>
                <p className='text-2xl font-medium italic leading-relaxed transition-all duration-700 group-hover:scale-[1.02] tracking-tight' style={{ color: 'var(--text-secondary)' }}>
                    "{randomQuote}"
                </p>
                <div className='mt-8 flex flex-col items-center gap-2'>
                    <p className='text-[10px] font-black uppercase tracking-[0.5em] text-[#2048FF]' >
                        Richard Dawkins
                    </p>
                    <p className='text-[8px] font-bold uppercase tracking-[0.3em] opacity-30' style={{ color: 'var(--text-primary)' }}>
                        Evolutionary Biologist & Author
                    </p>
                </div>
            </div>
            <div className='flex gap-4'>
                <div className='w-2 h-2 rounded-full bg-blue-500/10 animate-pulse' />
                <div className='w-2 h-2 rounded-full bg-blue-500/30 animate-pulse delay-75' />
                <div className='w-2 h-2 rounded-full bg-blue-500/10 animate-pulse delay-150' />
            </div>
        </div>
    )
}
