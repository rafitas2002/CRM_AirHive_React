export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

export type AttemptTone = 'success' | 'error' | 'info'

export type GameChallenge = {
    consonants: string
    wordCount: number
    sampleWords: string[]
}

export type ValidationResponse = {
    tone: AttemptTone
    message: string
    normalizedWord: string | null
}

export const normalizeCandidateWord = (raw: string) => String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '')

export const normalizeConsonantTriplet = (raw: string) => normalizeCandidateWord(raw)
    .split('')
    .filter((letter) => !VOWELS.has(letter))
    .join('')
    .slice(0, 3)
    .toUpperCase()

export const hasConsonantsInOrder = (word: string, consonants: string) => {
    const normalizedWord = normalizeCandidateWord(word)
    const normalizedConsonants = normalizeConsonantTriplet(consonants).toLowerCase()

    if (normalizedConsonants.length !== 3 || normalizedWord.length < 3) return false

    let from = 0
    for (const consonant of normalizedConsonants) {
        const next = normalizedWord.indexOf(consonant, from)
        if (next === -1) return false
        from = next + 1
    }

    return true
}
