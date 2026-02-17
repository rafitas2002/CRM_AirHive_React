'use client'

import { useMemo } from 'react'

export default function RichardDawkinsFooter() {
    const dawkinsQuotes = useMemo(() => [
        { quote: "Science is the poetry of reality.", source: "The Magic of Reality (2011)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "We are going to die, and that makes us the lucky ones. Most people are never going to die because they are never going to be born.", source: "Unweaving the Rainbow (1998)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The feeling of awed wonder that science can give us is one of the highest experiences of which the human psyche is capable.", source: "Unweaving the Rainbow (1998)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Nature is not cruel, only pitilessly indifferent. This is one of the hardest lessons for humans to learn.", source: "River Out of Eden (1995)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Cumulative selection is the key to understanding the complexity of life.", source: "The Blind Watchmaker (1986)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The universe we observe has precisely the properties we should expect if there is, at bottom, no design, no purpose, no evil, no good, nothing but pitiless indifference.", source: "River Out of Eden (1995)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The truth is more magical than any myth or made-up mystery or miracle.", source: "The Magic of Reality (2011)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "We are survival machines – robot vehicles blindly programmed to preserve the selfish molecules known as genes.", source: "The Selfish Gene (1976)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The essence of life is statistical improbability on a colossal scale.", source: "The Blind Watchmaker (1986)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Faith is the great cop-out, the great excuse to evade the need to think and evaluate evidence.", source: "The God Delusion (2006)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Evolution is a fact. Beyond reasonable doubt, beyond serious doubt, beyond sane, informed, intelligent doubt, beyond doubt evolution is a fact.", source: "The Greatest Show on Earth (2009)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The meme for blind faith secures its own perpetuation by the simple unconscious expedient of discouraging rational inquiry.", source: "The Selfish Gene (1976)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Natural selection is the blind watchmaker, blind because it does not see ahead, does not plan consequences, has no purpose in view.", source: "The Blind Watchmaker (1986)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "DNA neither cares nor knows. DNA just is. And we dance to its music.", source: "River Out of Eden (1995)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The total amount of suffering per year in the natural world is beyond all decent contemplation.", source: "River Out of Eden (1995)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Science replaces private prejudice with publicly verifiable evidence.", source: "The God Delusion (2006), contexto de argumentación pública", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "If you don't understand how something works, never mind: just give up and say God did it.", source: "The God Delusion (2006), crítica del God of the gaps", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The God of the Old Testament is arguably the most unpleasant character in all fiction.", source: "The God Delusion (2006)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Isn't it enough to see that a garden is beautiful without having to believe that there are fairies at the bottom of it too?", source: "Unweaving the Rainbow (1998)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The theory of evolution by cumulative natural selection is the only theory we know of that is in principle capable of explaining the existence of organized complexity.", source: "The Blind Watchmaker (1986)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "We admit that we are like apes, but we seldom realize that we are apes.", source: "The Ancestor's Tale (2004)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The human psyche has two great sicknesses: the urge to carry vendetta across generations, and the tendency to fasten group labels on people.", source: "The God Delusion (2006), contexto sociocultural", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Let us try to teach generosity and altruism, because we are born selfish.", source: "The Selfish Gene (1976)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The chances of each of us coming into existence are infinitesimally small, and even though we shall all die some day, we should count ourselves fantastically lucky to get our decades in the sun.", source: "Unweaving the Rainbow (1998)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Science is interesting, and if you don't agree, you can fk off.", source: "Conferencia pública/entrevista (frase atribuida en contexto divulgativo)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The beauty of evolution is that it does explain, in a very simple way, the existence of extraordinary complexity.", source: "The Blind Watchmaker (1986), tesis central", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "My eyes are constantly wide open to the extraordinary fact of existence.", source: "The Magic of Reality (2011), tono autobiográfico", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "The world is divided into things that look as though somebody designed them and things that look as though they didn't.", source: "The Blind Watchmaker (1986)", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "However many ways there may be of being alive, it is certain that there are vastly more ways of being dead.", source: "The Blind Watchmaker (1986), argumento de improbabilidad", author: 'Richard Dawkins', role: 'Evolutionary Biologist & Author' },
        { quote: "Quien gana la carrera no es necesariamente el más rápido, sino quien cruza la meta primero.", source: "Declaración interna en AirHive", author: 'Jesús Gracia', role: 'Director Comercial de AirHive', highlightGold: true },
        { quote: "A la única persona que le gusta el cambio es a un bebé con un pañal sucio.", source: "Declaración interna en AirHive", author: 'Jesús Gracia', role: 'Director Comercial de AirHive', highlightGold: true }
    ], [])

    const randomQuoteData = useMemo(() => {
        return dawkinsQuotes[Math.floor(Math.random() * dawkinsQuotes.length)]
    }, [dawkinsQuotes])

    return (
        <div className='flex flex-col items-center justify-center gap-6 select-none mt-12 mb-24'>
            <div className='w-32 h-1 bg-gradient-to-r from-transparent via-blue-600 to-transparent rounded-full opacity-30' />
            <div className='max-w-3xl px-8 text-center group'>
                <p
                    className='text-2xl font-medium italic leading-relaxed transition-all duration-700 group-hover:scale-[1.02] tracking-tight'
                    style={{ color: randomQuoteData.highlightGold ? '#D4AF37' : 'var(--text-secondary)' }}
                >
                    "{randomQuoteData.quote}"
                </p>
                <div className='mt-8 flex flex-col items-center gap-2'>
                    <p className='text-[10px] font-black uppercase tracking-[0.5em] text-[#2048FF]'>
                        {randomQuoteData.author}
                    </p>
                    <p className='text-[8px] font-bold uppercase tracking-[0.3em] opacity-30' style={{ color: 'var(--text-primary)' }}>
                        {randomQuoteData.role}
                    </p>
                    <p className='text-[10px] font-bold tracking-wide opacity-70' style={{ color: 'var(--text-secondary)' }}>
                        Fuente: {randomQuoteData.source}
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
