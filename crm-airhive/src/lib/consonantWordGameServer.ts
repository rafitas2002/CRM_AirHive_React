import { createRequire } from 'module'
import {
    GameChallenge,
    ValidationResponse,
    hasConsonantsInOrder,
    normalizeCandidateWord,
    normalizeConsonantTriplet
} from './consonantWordGame'
import spanishCommonWordsTop10000 from '@/data/spanishCommonWordsTop10000.json'

const require = createRequire(import.meta.url)
const spanishWords = require('an-array-of-spanish-words') as string[]
const isoCountries = require('i18n-iso-countries') as {
    registerLocale: (locale: unknown) => void
    getNames: (lang: string, options?: { select?: 'official' | 'alias' | 'all' }) => Record<string, string | string[]>
}

isoCountries.registerLocale(require('i18n-iso-countries/langs/es.json'))
isoCountries.registerLocale(require('i18n-iso-countries/langs/en.json'))

type TripletStats = {
    count: number
    samples: string[]
}

type DictionaryEntry = {
    word: string
    consonantSequence: string
}

type TripletIndex = {
    dictionaryWords: string[]
    dictionaryEntries: DictionaryEntry[]
    tripletSeedPool: string[]
    dictionarySet: Set<string>
    allDictionarySet: Set<string>
    infinitiveSet: Set<string>
    likelyVerbInfinitiveSet: Set<string>
    nonConjugatedSet: Set<string>
}

const MIN_WORDS_PER_CHALLENGE = 150
const MAX_WORDS_PER_CHALLENGE = 1400
const MAX_SAMPLES_PER_TRIPLET = 8
const COMMON_WORD_RANK_LIMIT_PRIMARY = 5000
const COMMON_WORD_RANK_LIMIT_FALLBACK = 7000
const COMMON_WORD_RANK_LIMIT_MAX = 10000
const COMMON_WORD_MIN_RESULTS = 8
const COMMON_WORD_MAX_RESULTS = 120
const COMMON_WORD_DERIVED_BASE_RANK_LIMIT = 7000

const COMMON_DERIVATION_SUFFIXES = [
    'icos',
    'icas',
    'ico',
    'ica',
    'arios',
    'arias',
    'ario',
    'aria',
    'osos',
    'osas',
    'oso',
    'osa',
    'ivos',
    'ivas',
    'ivo',
    'iva',
    'eros',
    'eras',
    'ero',
    'era',
    'ales',
    'al',
    'istas',
    'ista',
    'bles',
    'ble',
    'ntes',
    'nte'
] as const

const FAMILY_SUFFIX_RULES: Array<{ suffix: string; replacement?: string }> = [
    { suffix: 'eamiento' },
    { suffix: 'amiento' },
    { suffix: 'imiento' },
    { suffix: 'eadora' },
    { suffix: 'izadora' },
    { suffix: 'izacion' },
    { suffix: 'icidad' },
    { suffix: 'eacion' },
    { suffix: 'eador' },
    { suffix: 'izador' },
    { suffix: 'idades' },
    { suffix: 'idad' },
    { suffix: 'eada' },
    { suffix: 'eado' },
    { suffix: 'ada' },
    { suffix: 'ado' },
    { suffix: 'illa' },
    { suffix: 'illo' },
    { suffix: 'ita' },
    { suffix: 'ito' },
    { suffix: 'aza' },
    { suffix: 'azo' },
    { suffix: 'ota' },
    { suffix: 'ote' },
    { suffix: 'era' },
    { suffix: 'ero' },
    { suffix: 'ear' },
    { suffix: 'eo' },
    { suffix: 'ela', replacement: 'el' }
]

const NOMINAL_ENDINGS = [
    'cion', 'sion', 'dad', 'tad', 'eza', 'ez', 'ura', 'miento', 'ncia',
    'ble', 'ario', 'aria', 'ivo', 'iva', 'oso', 'osa', 'aje',
    'bro', 'dro', 'gro', 'cro', 'ero', 'era', 'ma'
]

const COMMON_PROPER_NOUNS = [
    'mexico', 'españa', 'colombia', 'argentina', 'chile', 'peru', 'ecuador', 'uruguay', 'paraguay',
    'bolivia', 'venezuela', 'guatemala', 'honduras', 'nicaragua', 'costa rica', 'panama', 'cuba',
    'guadalajara', 'monterrey', 'merida', 'queretaro', 'santiago', 'bogota', 'medellin', 'lima',
    'madrid', 'barcelona', 'sevilla', 'malaga', 'buenos aires', 'montevideo', 'quito', 'cordoba',
    'danubio', 'nilo', 'amazonas', 'parana', 'orinoco', 'mississippi', 'volga', 'ganges', 'eufrates',
    'manuel', 'maria', 'juan', 'jose', 'pedro', 'ana', 'laura', 'miguel', 'carlos', 'fernando',
    'lopez', 'martinez', 'gonzalez', 'hernandez', 'ramirez', 'sanchez', 'torres', 'rivera', 'morales'
]

const EXTRA_ACCEPTED_WORDS = [
    // Variantes de uso común no presentes en el diccionario base.
    'camoflajear',
    'camuflajear'
]

const MAJOR_CITY_SPANISH_ALIASES = [
    'ciudad de mexico', 'nueva york', 'nueva delhi', 'el cairo', 'pekin', 'moscu', 'bombay',
    'calcuta', 'estambul', 'sao paulo', 'rio de janeiro', 'ciudad del cabo', 'ciudad de guatemala',
    'santo domingo', 'ciudad de panama', 'ciudad de belice', 'san petersburgo', 'la habana',
    'ciudad de kuwait', 'ciudad de ho chi minh', 'ciudad de taipei', 'ciudad de kansas',
    'ciudad de puebla', 'ciudad juarez', 'san cristobal', 'santa cruz', 'santa fe', 'san luis',
    'buenos aires', 'bogota', 'medellin', 'lima', 'santiago', 'monterrey', 'guadalajara', 'queretaro',
    'londres', 'paris', 'roma', 'viena', 'munich', 'praga', 'berlin', 'atenas', 'bruselas',
    'amsterdam', 'lisboa', 'zurich', 'ginebra', 'seul', 'tokio', 'osaka', 'pekin', 'shanghai',
    'milan', 'florencia', 'venecia', 'moscu', 'estocolmo', 'helsinki', 'oslo', 'copenhague',
    'dublin', 'edimburgo', 'manchester', 'liverpool', 'varsovia', 'budapest', 'bucarest',
    'belgrado', 'sarajevo', 'sofia', 'kiev', 'odessa', 'dubai', 'abu dabi', 'riyad', 'yeda'
]

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

const buildGeographicProperNouns = () => {
    const words = new Set<string>()

    for (const locale of ['es', 'en'] as const) {
        const countryNamesByCode = isoCountries.getNames(locale, { select: 'all' })
        for (const rawValue of Object.values(countryNamesByCode)) {
            const values = Array.isArray(rawValue) ? rawValue : [rawValue]
            for (const value of values) {
                if (typeof value !== 'string') continue
                const trimmed = value.trim()
                if (trimmed.length < 2) continue
                words.add(trimmed)
            }
        }
    }

    for (const alias of MAJOR_CITY_SPANISH_ALIASES) {
        words.add(alias)
    }

    // Alias frecuentes de países.
    for (const alias of ['eeuu', 'usa', 'u s a', 'reino unido', 'corea del sur', 'corea del norte', 'rusia', 'vaticano']) {
        words.add(alias)
    }

    return Array.from(words)
}

const GEOGRAPHIC_PROPER_NOUNS = buildGeographicProperNouns()

const CONJUGATION_RULES: Array<{ ending: string; infinitives: Array<'ar' | 'er' | 'ir'> }> = [
    { ending: 'asteis', infinitives: ['ar'] },
    { ending: 'isteis', infinitives: ['er', 'ir'] },
    { ending: 'abamos', infinitives: ['ar'] },
    { ending: 'abais', infinitives: ['ar'] },
    { ending: 'ieron', infinitives: ['er', 'ir'] },
    { ending: 'iendo', infinitives: ['er', 'ir'] },
    { ending: 'yendo', infinitives: ['er', 'ir'] },
    { ending: 'aramos', infinitives: ['ar'] },
    { ending: 'arais', infinitives: ['ar'] },
    { ending: 'eramos', infinitives: ['er'] },
    { ending: 'erais', infinitives: ['er'] },
    { ending: 'iramos', infinitives: ['ir'] },
    { ending: 'irais', infinitives: ['ir'] },
    { ending: 'ieramos', infinitives: ['er', 'ir'] },
    { ending: 'ierais', infinitives: ['er', 'ir'] },
    { ending: 'ieran', infinitives: ['er', 'ir'] },
    { ending: 'ieras', infinitives: ['er', 'ir'] },
    { ending: 'iera', infinitives: ['er', 'ir'] },
    { ending: 'iesemos', infinitives: ['er', 'ir'] },
    { ending: 'ieseis', infinitives: ['er', 'ir'] },
    { ending: 'iesen', infinitives: ['er', 'ir'] },
    { ending: 'ieses', infinitives: ['er', 'ir'] },
    { ending: 'iese', infinitives: ['er', 'ir'] },
    { ending: 'asemos', infinitives: ['ar'] },
    { ending: 'aseis', infinitives: ['ar'] },
    { ending: 'asen', infinitives: ['ar'] },
    { ending: 'ases', infinitives: ['ar'] },
    { ending: 'ase', infinitives: ['ar'] },
    { ending: 'aremos', infinitives: ['ar'] },
    { ending: 'areis', infinitives: ['ar'] },
    { ending: 'aran', infinitives: ['ar'] },
    { ending: 'aras', infinitives: ['ar'] },
    { ending: 'ara', infinitives: ['ar'] },
    { ending: 'eremos', infinitives: ['er'] },
    { ending: 'ereis', infinitives: ['er'] },
    { ending: 'eran', infinitives: ['er'] },
    { ending: 'eras', infinitives: ['er'] },
    { ending: 'era', infinitives: ['er'] },
    { ending: 'iremos', infinitives: ['ir'] },
    { ending: 'ireis', infinitives: ['ir'] },
    { ending: 'iran', infinitives: ['ir'] },
    { ending: 'iras', infinitives: ['ir'] },
    { ending: 'ira', infinitives: ['ir'] },
    { ending: 'ariamos', infinitives: ['ar'] },
    { ending: 'ariais', infinitives: ['ar'] },
    { ending: 'arian', infinitives: ['ar'] },
    { ending: 'arias', infinitives: ['ar'] },
    { ending: 'aria', infinitives: ['ar'] },
    { ending: 'eriamos', infinitives: ['er'] },
    { ending: 'eriais', infinitives: ['er'] },
    { ending: 'erian', infinitives: ['er'] },
    { ending: 'erias', infinitives: ['er'] },
    { ending: 'eria', infinitives: ['er'] },
    { ending: 'iriamos', infinitives: ['ir'] },
    { ending: 'iriais', infinitives: ['ir'] },
    { ending: 'irian', infinitives: ['ir'] },
    { ending: 'irias', infinitives: ['ir'] },
    { ending: 'iria', infinitives: ['ir'] },
    { ending: 'ando', infinitives: ['ar'] },
    { ending: 'aste', infinitives: ['ar'] },
    { ending: 'aron', infinitives: ['ar'] },
    { ending: 'abas', infinitives: ['ar'] },
    { ending: 'aban', infinitives: ['ar'] },
    { ending: 'aba', infinitives: ['ar'] },
    { ending: 'iste', infinitives: ['er', 'ir'] },
    { ending: 'imos', infinitives: ['er', 'ir'] },
    { ending: 'ian', infinitives: ['er', 'ir'] },
    { ending: 'ias', infinitives: ['er', 'ir'] },
    { ending: 'ia', infinitives: ['er', 'ir'] },
    { ending: 'ad', infinitives: ['ar'] },
    { ending: 'ed', infinitives: ['er'] },
    { ending: 'id', infinitives: ['ir'] }
]

const PRESENT_CONJUGATION_RULES: Array<{
    ending: string
    infinitives: Array<'ar' | 'er' | 'ir'>
    minWordLength: number
}> = [
    { ending: 'amos', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'emos', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'imos', infinitives: ['er', 'ir'], minWordLength: 7 },
    { ending: 'ais', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'eis', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'an', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'en', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'as', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'es', infinitives: ['ar', 'er', 'ir'], minWordLength: 7 },
    { ending: 'is', infinitives: ['ir'], minWordLength: 7 },
    { ending: 'o', infinitives: ['ar', 'er', 'ir'], minWordLength: 8 },
    { ending: 'a', infinitives: ['ar', 'er', 'ir'], minWordLength: 8 },
    { ending: 'e', infinitives: ['ar', 'er', 'ir'], minWordLength: 8 }
]

const EXTRA_CONJUGATION_SUFFIX_RULES: Array<{
    ending: string
    infinitiveSuffixes: string[]
    minWordLength: number
    skipIfNominalPluralEvidence?: boolean
}> = [
    { ending: 'iamos', infinitiveSuffixes: ['er', 'ir'], minWordLength: 7 },
    { ending: 'iais', infinitiveSuffixes: ['er', 'ir'], minWordLength: 7 },
    { ending: 'iereis', infinitiveSuffixes: ['er', 'ir'], minWordLength: 8 },
    { ending: 'ieremos', infinitiveSuffixes: ['er', 'ir'], minWordLength: 8 },
    { ending: 'ieren', infinitiveSuffixes: ['er', 'ir'], minWordLength: 7 },
    { ending: 'iere', infinitiveSuffixes: ['er', 'ir'], minWordLength: 7 },
    { ending: 'io', infinitiveSuffixes: ['er', 'ir'], minWordLength: 6 },
    { ending: 'i', infinitiveSuffixes: ['er', 'ir'], minWordLength: 6 },
    { ending: 'zco', infinitiveSuffixes: ['cer', 'cir'], minWordLength: 7 },
    { ending: 'zca', infinitiveSuffixes: ['cer', 'cir'], minWordLength: 7 },
    { ending: 'zcas', infinitiveSuffixes: ['cer', 'cir'], minWordLength: 8 },
    { ending: 'zcamos', infinitiveSuffixes: ['cer', 'cir'], minWordLength: 9 },
    { ending: 'zcais', infinitiveSuffixes: ['cer', 'cir'], minWordLength: 9 },
    { ending: 'zcan', infinitiveSuffixes: ['cer', 'cir'], minWordLength: 8 },
    { ending: 'ecido', infinitiveSuffixes: ['ecer'], minWordLength: 8 },
    { ending: 'ecida', infinitiveSuffixes: ['ecer'], minWordLength: 8 },
    { ending: 'ecidos', infinitiveSuffixes: ['ecer'], minWordLength: 9 },
    { ending: 'ecidas', infinitiveSuffixes: ['ecer'], minWordLength: 9 },
    { ending: 'eado', infinitiveSuffixes: ['ear'], minWordLength: 8 },
    { ending: 'eada', infinitiveSuffixes: ['ear'], minWordLength: 8 },
    { ending: 'eados', infinitiveSuffixes: ['ear'], minWordLength: 9 },
    { ending: 'eadas', infinitiveSuffixes: ['ear'], minWordLength: 9 },
    { ending: 'o', infinitiveSuffixes: ['ar', 'er', 'ir'], minWordLength: 7, skipIfNominalPluralEvidence: true },
    { ending: 'e', infinitiveSuffixes: ['ar', 'er', 'ir'], minWordLength: 7 }
]

const FUTURE_CONDITIONAL_RULES: Array<{
    ending: string
    minWordLength: number
}> = [
    { ending: 'iamos', minWordLength: 8 },
    { ending: 'iais', minWordLength: 8 },
    { ending: 'ian', minWordLength: 7 },
    { ending: 'ias', minWordLength: 7 },
    { ending: 'ia', minWordLength: 7 },
    { ending: 'emos', minWordLength: 7 },
    { ending: 'eis', minWordLength: 7 },
    { ending: 'en', minWordLength: 8 },
    { ending: 'an', minWordLength: 8 },
    { ending: 'as', minWordLength: 8 },
    { ending: 'a', minWordLength: 9 },
    { ending: 'e', minWordLength: 9 }
]

const IRREGULAR_FUTURE_STEM_MAP: Record<string, string> = {
    dir: 'decir',
    har: 'hacer',
    cabr: 'caber',
    habr: 'haber',
    podr: 'poder',
    sabr: 'saber',
    querr: 'querer'
}

const IRREGULAR_J_STEM_SUFFIXES = [
    'isteis',
    'eremos',
    'ereis',
    'esemos',
    'eseis',
    'eramos',
    'erais',
    'iste',
    'imos',
    'eron',
    'eran',
    'eras',
    'eres',
    'eren',
    'eses',
    'esen',
    'era',
    'ere',
    'ese',
    'io',
    'ia',
    'ie',
    'is',
    'e',
    'o'
] as const

const IRREGULAR_J_STEM_BASE_MAP: Record<string, string> = {
    di: 'decir',
    hi: 'hacer'
}

const extractConsonantSequence = (word: string) =>
    word.split('').filter((letter) => !VOWELS.has(letter)).join('')

const extractTripletSeedsFromConsonantSequence = (consonantSequence: string) => {
    if (consonantSequence.length < 3) return []
    const triplets = new Set<string>()
    for (let first = 0; first <= consonantSequence.length - 3; first += 1) {
        for (let second = first + 1; second <= consonantSequence.length - 2; second += 1) {
            for (let third = second + 1; third <= consonantSequence.length - 1; third += 1) {
                triplets.add(`${consonantSequence[first]}${consonantSequence[second]}${consonantSequence[third]}`.toUpperCase())
            }
        }
    }
    return Array.from(triplets)
}

const normalizeSourceWord = (raw: string) => normalizeCandidateWord(raw).replace(/ /g, '')

const buildSpanishCommonWordRankMap = () => {
    const rankMap = new Map<string, number>()
    for (let index = 0; index < spanishCommonWordsTop10000.length; index += 1) {
        const normalized = normalizeSourceWord(spanishCommonWordsTop10000[index] || '')
        if (!normalized || rankMap.has(normalized)) continue
        rankMap.set(normalized, index + 1)
    }

    return rankMap
}

const SPANISH_COMMON_WORD_RANK_MAP = buildSpanishCommonWordRankMap()

const getCommonBaseStems = (word: string) => {
    const stems = new Set<string>([word])

    if (word.length >= 5 && /[aeiou]$/.test(word)) {
        stems.add(word.slice(0, -1))
    }

    return stems
}

const isDerivedFromCommonBase = ({
    word,
    commonBaseStems
}: {
    word: string
    commonBaseStems: Set<string>
}) => {
    for (const suffix of COMMON_DERIVATION_SUFFIXES) {
        if (!word.endsWith(suffix)) continue
        if (word.length <= suffix.length + 2) continue

        const base = word.slice(0, -suffix.length)
        if (base.length < 4) continue

        if (commonBaseStems.has(base)) return true
        if (commonBaseStems.has(`${base}a`)) return true
        if (commonBaseStems.has(`${base}o`)) return true
        if (commonBaseStems.has(`${base}e`)) return true
    }

    return false
}

const isValidSourceWord = (word: string) => {
    if (!word || word.length < 3 || word.length > 28) return false
    if (!/^[a-z]+$/.test(word)) return false
    const vowelCount = word.split('').filter((letter) => ['a', 'e', 'i', 'o', 'u'].includes(letter)).length
    const consonantCount = word.length - vowelCount
    return vowelCount >= 1 && consonantCount >= 2
}

const isInfinitive = (word: string) => word.length >= 4 && /[a-z]+(ar|er|ir)$/.test(word)

const hasStrongNominalEnding = (word: string) =>
    NOMINAL_ENDINGS.some((ending) => word.endsWith(ending) && word.length > ending.length + 1)

const hasLikelyVerbEvidence = ({
    infinitive,
    lexiconSet
}: {
    infinitive: string
    lexiconSet: Set<string>
}) => {
    if (!isInfinitive(infinitive)) return false
    const stem = infinitive.slice(0, -2)
    const verbEnding = infinitive.slice(-2)

    const evidenceForms = verbEnding === 'ar'
        ? [`${stem}ando`, `${stem}ado`, `${stem}aba`, `${stem}aste`, `${stem}aron`]
        : [`${stem}iendo`, `${stem}ido`, `${stem}ia`, `${stem}iste`, `${stem}ieron`]

    return evidenceForms.some((form) => lexiconSet.has(form))
}

const hasNominalPluralEvidence = ({
    word,
    lexiconSet
}: {
    word: string
    lexiconSet: Set<string>
}) => {
    if (!word || word.length < 3) return false

    if (lexiconSet.has(`${word}s`)) return true
    if (lexiconSet.has(`${word}es`)) return true
    if (word.endsWith('z') && lexiconSet.has(`${word.slice(0, -1)}ces`)) return true

    return false
}

const hasMasculineNominalPluralEvidence = ({
    word,
    lexiconSet
}: {
    word: string
    lexiconSet: Set<string>
}) => word.endsWith('o') && lexiconSet.has(`${word}s`)

const replaceLastOccurrence = (value: string, search: string, replacement: string) => {
    const index = value.lastIndexOf(search)
    if (index === -1) return null
    return `${value.slice(0, index)}${replacement}${value.slice(index + search.length)}`
}

const resolveJStemIrregularInfinitive = ({
    word,
    infinitiveSet
}: {
    word: string
    infinitiveSet: Set<string>
}) => {
    if (!word || word.length < 4 || !word.includes('j') || isInfinitive(word)) return null

    for (const suffix of IRREGULAR_J_STEM_SUFFIXES) {
        if (!word.endsWith(suffix) || word.length <= suffix.length + 1) continue
        const stem = word.slice(0, -suffix.length)
        if (!stem.endsWith('j') || stem.length < 2) continue

        const root = stem.slice(0, -1)
        const candidates = new Set<string>([
            `${root}cir`,
            `${root}er`,
            `${root}ir`
        ])

        const mapped = IRREGULAR_J_STEM_BASE_MAP[root]
        if (mapped) candidates.add(mapped)

        for (const candidate of candidates) {
            if (isInfinitive(candidate) && infinitiveSet.has(candidate)) {
                return candidate
            }
        }
    }

    return null
}

const resolveFutureConditionalInfinitiveFromBase = ({
    base,
    infinitiveSet
}: {
    base: string
    infinitiveSet: Set<string>
}) => {
    const candidates: string[] = []
    const seen = new Set<string>()
    const pushCandidate = (candidate: string | null) => {
        if (!candidate || seen.has(candidate)) return
        seen.add(candidate)
        candidates.push(candidate)
    }

    if (isInfinitive(base)) {
        pushCandidate(base)
    }

    if (IRREGULAR_FUTURE_STEM_MAP[base]) {
        pushCandidate(IRREGULAR_FUTURE_STEM_MAP[base])
    }

    // Futuro/condicional irregular con "dr" (abstendr- -> abstener, vendr- -> vender, saldr- -> salir).
    if (base.endsWith('dr') && base.length >= 4) {
        const stemWithoutDr = base.slice(0, -2)
        pushCandidate(`${stemWithoutDr}er`)
        pushCandidate(`${stemWithoutDr}ir`)
    }

    for (const candidate of candidates) {
        if (isInfinitive(candidate) && infinitiveSet.has(candidate)) {
            return candidate
        }
    }

    return null
}

const resolveFutureConditionalInfinitive = ({
    word,
    infinitiveSet
}: {
    word: string
    infinitiveSet: Set<string>
}) => {
    for (const rule of FUTURE_CONDITIONAL_RULES) {
        if (word.length < rule.minWordLength) continue
        if (!word.endsWith(rule.ending) || word.length <= rule.ending.length + 2) continue
        const base = word.slice(0, -rule.ending.length)
        const candidate = resolveFutureConditionalInfinitiveFromBase({ base, infinitiveSet })
        if (candidate && candidate !== word) return candidate
    }

    return null
}

const getVerbStemVariants = (stem: string) => {
    const variants = [stem]
    const seen = new Set(variants)
    const pushVariant = (candidate: string | null) => {
        if (!candidate || seen.has(candidate)) return
        seen.add(candidate)
        variants.push(candidate)
    }

    // Alternancias frecuentes en presente/subjuntivo de verbos irregulares.
    pushVariant(replaceLastOccurrence(stem, 'ie', 'e'))
    pushVariant(replaceLastOccurrence(stem, 'ue', 'o'))
    pushVariant(replaceLastOccurrence(stem, 'i', 'e'))
    pushVariant(replaceLastOccurrence(stem, 'qu', 'c'))
    pushVariant(replaceLastOccurrence(stem, 'gu', 'g'))
    pushVariant(replaceLastOccurrence(stem, 'c', 'z'))
    pushVariant(replaceLastOccurrence(stem, 'g', 'j'))
    pushVariant(replaceLastOccurrence(stem, 'j', 'c'))

    return variants
}

const resolveConjugatedInfinitive = ({
    word,
    infinitiveSet,
    lexiconSet
}: {
    word: string
    infinitiveSet: Set<string>
    lexiconSet: Set<string>
}) => {
    if (!word || word.length < 4) return null
    if (isInfinitive(word)) return null

    const irregularJStemInfinitive = resolveJStemIrregularInfinitive({
        word,
        infinitiveSet
    })
    if (irregularJStemInfinitive && irregularJStemInfinitive !== word) {
        return irregularJStemInfinitive
    }

    // Future / conditional family.
    for (const rule of FUTURE_CONDITIONAL_RULES) {
        if (word.length < rule.minWordLength) continue
        if (!word.endsWith(rule.ending) || word.length <= rule.ending.length + 2) continue
        if (rule.ending === 'a' && hasStrongNominalEnding(word)) continue
        const base = word.slice(0, -rule.ending.length)
        const candidate = resolveFutureConditionalInfinitiveFromBase({ base, infinitiveSet })
        if (candidate && candidate !== word) return candidate
    }

    for (const rule of CONJUGATION_RULES) {
        if (!word.endsWith(rule.ending) || word.length <= rule.ending.length + 1) continue
        const stem = word.slice(0, -rule.ending.length)
        for (const stemVariant of getVerbStemVariants(stem)) {
            for (const infinitiveEnding of rule.infinitives) {
                const candidate = `${stemVariant}${infinitiveEnding}`
                if (infinitiveSet.has(candidate)) return candidate
            }
        }
    }

    for (const rule of PRESENT_CONJUGATION_RULES) {
        if (word.length < rule.minWordLength) continue
        if (!word.endsWith(rule.ending) || word.length <= rule.ending.length + 1) continue
        if (rule.ending === 'o' && hasMasculineNominalPluralEvidence({ word, lexiconSet })) continue
        if (hasStrongNominalEnding(word)) continue
        const stem = word.slice(0, -rule.ending.length)
        for (const stemVariant of getVerbStemVariants(stem)) {
            for (const infinitiveEnding of rule.infinitives) {
                const candidate = `${stemVariant}${infinitiveEnding}`
                if (infinitiveSet.has(candidate)) return candidate
            }
        }
    }

    for (const rule of EXTRA_CONJUGATION_SUFFIX_RULES) {
        if (word.length < rule.minWordLength) continue
        if (!word.endsWith(rule.ending) || word.length <= rule.ending.length + 1) continue
        if (rule.skipIfNominalPluralEvidence && hasNominalPluralEvidence({ word, lexiconSet })) continue

        const stem = word.slice(0, -rule.ending.length)
        for (const stemVariant of getVerbStemVariants(stem)) {
            for (const infinitiveSuffix of rule.infinitiveSuffixes) {
                const candidate = `${stemVariant}${infinitiveSuffix}`
                if (infinitiveSet.has(candidate)) return candidate
            }
        }
    }

    return null
}

const isLikelyVerbConjugation = ({
    word,
    infinitiveSet,
    lexiconSet
}: {
    word: string
    infinitiveSet: Set<string>
    lexiconSet: Set<string>
}) => {
    const infinitive = resolveConjugatedInfinitive({ word, infinitiveSet, lexiconSet })
    return !!infinitive && infinitive !== word
}

const getSingularCandidatesFromPlural = (word: string) => {
    if (!word || word.length < 4 || !word.endsWith('s')) return []

    const candidates = new Set<string>()
    const withoutS = word.slice(0, -1)
    if (withoutS.length >= 3) candidates.add(withoutS)

    if (word.endsWith('es')) {
        const withoutEs = word.slice(0, -2)
        if (withoutEs.length >= 3) candidates.add(withoutEs)
    }

    if (word.endsWith('ces')) {
        const stem = word.slice(0, -3)
        const withZ = `${stem}z`
        if (withZ.length >= 3) candidates.add(withZ)
    }

    return Array.from(candidates).filter((candidate) => candidate !== word)
}

const resolveSingularWordForPlural = ({
    pluralWord,
    triplet,
    dictionarySet,
    likelyVerbInfinitiveSet
}: {
    pluralWord: string
    triplet: string
    dictionarySet: Set<string>
    likelyVerbInfinitiveSet: Set<string>
}) => {
    const normalizedTriplet = normalizeConsonantTriplet(triplet)
    if (normalizedTriplet.length !== 3) return null

    const singularCandidates = getSingularCandidatesFromPlural(pluralWord)
        .filter((candidate) => dictionarySet.has(candidate))
        .filter((candidate) => !likelyVerbInfinitiveSet.has(candidate))
        .filter((candidate) => hasConsonantsInOrder(candidate, normalizedTriplet))
        .sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length
            return a.localeCompare(b, 'es', { sensitivity: 'base' })
        })

    return singularCandidates[0] || null
}

const isLikelyPlural = ({
    word,
    singularSet
}: {
    word: string
    singularSet: Set<string>
}) => {
    if (!word || word.length < 4 || !word.endsWith('s')) return false
    return getSingularCandidatesFromPlural(word).some((candidate) => singularSet.has(candidate))
}

const getCanonicalCandidates = (word: string) => {
    const candidates = new Set<string>([word])

    for (const rule of FAMILY_SUFFIX_RULES) {
        if (!word.endsWith(rule.suffix)) continue
        if (word.length <= rule.suffix.length + 2) continue
        const base = `${word.slice(0, -rule.suffix.length)}${rule.replacement || ''}`
        if (base.length >= 3) candidates.add(base)
    }

    // Masculino/femenino: si existen ambas variantes, deben contar como una sola.
    if (word.length >= 4) {
        if (word.endsWith('a')) {
            const stem = word.slice(0, -1)
            candidates.add(`${stem}o`)
            if (/(ora|ana|ona|ina)$/.test(word)) candidates.add(stem)
        } else if (word.endsWith('o')) {
            candidates.add(`${word.slice(0, -1)}a`)
        } else if (/(or|an|on|in)$/.test(word)) {
            candidates.add(`${word}a`)
        }
    }

    return Array.from(candidates)
}

const getCanonicalGenderPriority = (word: string) => {
    if (word.endsWith('o')) return 0
    if (/(or|an|on|in)$/.test(word)) return 1
    if (word.endsWith('a')) return 2
    return 1
}

const resolveCanonicalWordForTriplet = ({
    word,
    triplet,
    dictionarySet
}: {
    word: string
    triplet: string
    dictionarySet: Set<string>
}) => {
    if (!dictionarySet.has(word)) return word

    const normalizedTriplet = normalizeConsonantTriplet(triplet)
    if (normalizedTriplet.length !== 3) return word

    const matches = getCanonicalCandidates(word)
        .filter((candidate) => dictionarySet.has(candidate))
        .filter((candidate) => hasConsonantsInOrder(candidate, normalizedTriplet))
        .sort((a, b) => {
            const genderPriorityDelta = getCanonicalGenderPriority(a) - getCanonicalGenderPriority(b)
            if (genderPriorityDelta !== 0) return genderPriorityDelta
            if (a.length !== b.length) return a.length - b.length
            return a.localeCompare(b, 'es', { sensitivity: 'base' })
        })

    return matches[0] || word
}

const resolveCanonicalFromVariant = ({
    word,
    triplet,
    dictionarySet
}: {
    word: string
    triplet: string
    dictionarySet: Set<string>
}) => {
    const normalizedTriplet = normalizeConsonantTriplet(triplet)
    if (normalizedTriplet.length !== 3) return null

    const matches = getCanonicalCandidates(word)
        .filter((candidate) => candidate !== word)
        .filter((candidate) => dictionarySet.has(candidate))
        .filter((candidate) => hasConsonantsInOrder(candidate, normalizedTriplet))
        .sort((a, b) => {
            const genderPriorityDelta = getCanonicalGenderPriority(a) - getCanonicalGenderPriority(b)
            if (genderPriorityDelta !== 0) return genderPriorityDelta
            if (a.length !== b.length) return a.length - b.length
            return a.localeCompare(b, 'es', { sensitivity: 'base' })
        })

    if (matches.length === 0) return null

    return resolveCanonicalWordForTriplet({
        word: matches[0],
        triplet: normalizedTriplet,
        dictionarySet
    })
}

const buildIndex = (): TripletIndex => {
    const allDictionarySet = new Set<string>()
    const geographicNormalizedWords = new Set<string>()

    for (const rawWord of spanishWords) {
        const normalized = normalizeSourceWord(String(rawWord || ''))
        if (!isValidSourceWord(normalized)) continue
        allDictionarySet.add(normalized)
    }

    for (const rawProperNoun of COMMON_PROPER_NOUNS) {
        const normalized = normalizeSourceWord(rawProperNoun)
        if (!isValidSourceWord(normalized)) continue
        allDictionarySet.add(normalized)
    }

    for (const rawGeographicNoun of GEOGRAPHIC_PROPER_NOUNS) {
        const normalized = normalizeSourceWord(rawGeographicNoun)
        if (!isValidSourceWord(normalized)) continue
        geographicNormalizedWords.add(normalized)
        allDictionarySet.add(normalized)
    }

    for (const rawExtraWord of EXTRA_ACCEPTED_WORDS) {
        const normalized = normalizeSourceWord(rawExtraWord)
        if (!isValidSourceWord(normalized)) continue
        allDictionarySet.add(normalized)
    }

    const infinitiveSet = new Set(
        Array.from(allDictionarySet).filter((word) => isInfinitive(word))
    )
    const likelyVerbInfinitiveSet = new Set(
        Array.from(infinitiveSet).filter((word) => hasLikelyVerbEvidence({ infinitive: word, lexiconSet: allDictionarySet }))
    )

    const nonConjugatedWords = Array.from(allDictionarySet)
        .filter((word) => {
            if (isLikelyVerbConjugation({ word, infinitiveSet: likelyVerbInfinitiveSet, lexiconSet: allDictionarySet })) {
                return false
            }
            const futureInfinitive = resolveFutureConditionalInfinitive({
                word,
                infinitiveSet
            })
            return !futureInfinitive || futureInfinitive === word
        })
    const nonConjugatedSet = new Set(nonConjugatedWords)

    const dictionaryWords = nonConjugatedWords
        .filter((word) => geographicNormalizedWords.has(word) || !isLikelyPlural({ word, singularSet: nonConjugatedSet }))
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    const dictionarySet = new Set(dictionaryWords)
    const tripletSeedSet = new Set<string>()
    const dictionaryEntries = dictionaryWords.map((word) => {
        const consonantSequence = extractConsonantSequence(word)
        for (const triplet of extractTripletSeedsFromConsonantSequence(consonantSequence)) {
            tripletSeedSet.add(triplet)
        }
        return { word, consonantSequence }
    })

    const tripletSeedPool = Array.from(tripletSeedSet)
    if (tripletSeedPool.length === 0) {
        throw new Error('[consonantWordGameServer] No triplet seeds were built from dictionary.')
    }

    return {
        dictionaryWords,
        dictionaryEntries,
        tripletSeedPool,
        dictionarySet,
        allDictionarySet,
        infinitiveSet,
        likelyVerbInfinitiveSet,
        nonConjugatedSet
    }
}

const index = buildIndex()
const catalogCache = new Map<string, string[]>()
const commonCatalogCache = new Map<string, string[]>()
const statsCache = new Map<string, TripletStats>()
let allValidChallengeTripletsCache: string[] | null = null
let challengeTripletRotationQueue: string[] = []
let tripletCatalogBuildCompleted = false

const isTripletInChallengeRange = (stats: TripletStats) =>
    stats.count >= MIN_WORDS_PER_CHALLENGE && stats.count <= MAX_WORDS_PER_CHALLENGE

const shuffleTriplets = (triplets: string[]) => {
    const shuffled = [...triplets]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1))
        ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
    }
    return shuffled
}

const isWordCommonCandidate = (word: string) => {
    if (!word) return false
    if (isLikelyPlural({ word, singularSet: index.nonConjugatedSet })) return false

    const conjugatedInfinitive = resolveConjugatedInfinitive({
        word,
        infinitiveSet: index.likelyVerbInfinitiveSet,
        lexiconSet: index.allDictionarySet
    })
    if (conjugatedInfinitive && conjugatedInfinitive !== word) return false

    const futureConditionalInfinitive = resolveFutureConditionalInfinitive({
        word,
        infinitiveSet: index.infinitiveSet
    })
    if (futureConditionalInfinitive && futureConditionalInfinitive !== word) return false

    return true
}

const getCommonWordsFromCatalog = (words: string[]) => {
    const candidates = words
        .filter((word) => isWordCommonCandidate(word))
        .map((word) => ({ word, rank: SPANISH_COMMON_WORD_RANK_MAP.get(word) || null }))

    const rankedEntries = candidates
        .filter((entry): entry is { word: string; rank: number } => entry.rank !== null)
        .sort((a, b) => {
            if (a.rank !== b.rank) return a.rank - b.rank
            return a.word.localeCompare(b.word, 'es', { sensitivity: 'base' })
        })

    const commonBaseStemSet = new Set<string>()
    for (const entry of rankedEntries) {
        if (entry.rank > COMMON_WORD_DERIVED_BASE_RANK_LIMIT) continue
        for (const stem of getCommonBaseStems(entry.word)) {
            commonBaseStemSet.add(stem)
        }
    }

    const selectByMaxRank = (maxRank: number) => rankedEntries
        .filter((entry) => entry.rank <= maxRank)
        .slice(0, COMMON_WORD_MAX_RESULTS)
        .map((entry) => entry.word)

    let selected = selectByMaxRank(COMMON_WORD_RANK_LIMIT_PRIMARY)
    if (selected.length < COMMON_WORD_MIN_RESULTS) {
        selected = selectByMaxRank(COMMON_WORD_RANK_LIMIT_FALLBACK)
    }
    if (selected.length < COMMON_WORD_MIN_RESULTS) {
        selected = selectByMaxRank(COMMON_WORD_RANK_LIMIT_MAX)
    }

    const selectedSet = new Set(selected)
    const derivedCandidates = candidates
        .filter((entry) => !selectedSet.has(entry.word))
        .filter((entry) => isDerivedFromCommonBase({
            word: entry.word,
            commonBaseStems: commonBaseStemSet
        }))
        .sort((a, b) => {
            if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank
            if (a.rank !== null && b.rank === null) return -1
            if (a.rank === null && b.rank !== null) return 1
            if (a.word.length !== b.word.length) return a.word.length - b.word.length
            return a.word.localeCompare(b.word, 'es', { sensitivity: 'base' })
        })
        .map((entry) => entry.word)

    for (const word of derivedCandidates) {
        if (selected.length >= COMMON_WORD_MAX_RESULTS) break
        if (selectedSet.has(word)) continue
        selected.push(word)
        selectedSet.add(word)
    }

    return selected
}

const ensureTripletCatalogsBuilt = () => {
    if (tripletCatalogBuildCompleted) return

    const canonicalSetsByTriplet = new Map<string, Set<string>>()

    for (const entry of index.dictionaryEntries) {
        const triplets = extractTripletSeedsFromConsonantSequence(entry.consonantSequence)
        if (triplets.length === 0) continue

        for (const triplet of triplets) {
            let canonicalSet = canonicalSetsByTriplet.get(triplet)
            if (!canonicalSet) {
                canonicalSet = new Set<string>()
                canonicalSetsByTriplet.set(triplet, canonicalSet)
            }

            canonicalSet.add(resolveCanonicalWordForTriplet({
                word: entry.word,
                triplet,
                dictionarySet: index.dictionarySet
            }))
        }
    }

    const validTriplets: string[] = []

    for (const [triplet, canonicalSet] of canonicalSetsByTriplet) {
        const words = Array.from(canonicalSet)
            .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

        catalogCache.set(triplet, words)
        commonCatalogCache.set(triplet, getCommonWordsFromCatalog(words))

        const stats: TripletStats = {
            count: words.length,
            samples: words.slice(0, MAX_SAMPLES_PER_TRIPLET)
        }
        statsCache.set(triplet, stats)

        if (isTripletInChallengeRange(stats)) {
            validTriplets.push(triplet)
        }
    }

    allValidChallengeTripletsCache = validTriplets
    tripletCatalogBuildCompleted = true
}

const getCanonicalWordsForTriplet = (triplet: string) => {
    const normalizedTriplet = normalizeConsonantTriplet(triplet)
    if (normalizedTriplet.length !== 3) return []

    ensureTripletCatalogsBuilt()

    const cached = catalogCache.get(normalizedTriplet)
    if (cached) return cached

    // Tripleta sin palabras catalogadas.
    catalogCache.set(normalizedTriplet, [])
    return []
}

const getCommonWordsForTriplet = (triplet: string) => {
    const normalizedTriplet = normalizeConsonantTriplet(triplet)
    if (normalizedTriplet.length !== 3) return []

    ensureTripletCatalogsBuilt()

    const cached = commonCatalogCache.get(normalizedTriplet)
    if (cached) return cached

    commonCatalogCache.set(normalizedTriplet, [])
    return []
}

const getTripletStats = (triplet: string): TripletStats | null => {
    const normalizedTriplet = normalizeConsonantTriplet(triplet)
    if (normalizedTriplet.length !== 3) return null

    ensureTripletCatalogsBuilt()

    const cached = statsCache.get(normalizedTriplet)
    if (cached) return cached

    const stats: TripletStats = { count: 0, samples: [] }
    statsCache.set(normalizedTriplet, stats)
    return stats
}

const buildChallengeFromTriplet = (triplet: string): GameChallenge | null => {
    const normalizedTriplet = normalizeConsonantTriplet(triplet)
    if (normalizedTriplet.length !== 3) return null

    const stats = getTripletStats(normalizedTriplet)
    if (!stats || stats.count <= 0) return null

    return {
        consonants: normalizedTriplet,
        wordCount: stats.count,
        sampleWords: [...stats.samples].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    }
}

const getAllValidChallengeTriplets = () => {
    ensureTripletCatalogsBuilt()
    const discoveredTriplets = allValidChallengeTripletsCache || []
    if (discoveredTriplets.length === 0) {
        throw new Error('[consonantWordGameServer] Failed to discover valid challenge triplets.')
    }
    return discoveredTriplets
}

const refillChallengeTripletRotationQueue = (blocked: string) => {
    const allValidTriplets = getAllValidChallengeTriplets()
    const availableTriplets = blocked
        ? allValidTriplets.filter((triplet) => triplet !== blocked)
        : [...allValidTriplets]

    challengeTripletRotationQueue = shuffleTriplets(availableTriplets)

    if (challengeTripletRotationQueue.length === 0) {
        // Solo ocurriria si el pool tuviera 1 elemento y coincide con blocked.
        challengeTripletRotationQueue = shuffleTriplets(allValidTriplets)
    }
}

const pullNextChallengeTriplet = (blocked: string) => {
    if (challengeTripletRotationQueue.length === 0) {
        refillChallengeTripletRotationQueue(blocked)
    }

    if (challengeTripletRotationQueue.length === 0) return null

    const postponed: string[] = []
    while (challengeTripletRotationQueue.length > 0) {
        const candidate = challengeTripletRotationQueue.shift()
        if (!candidate) break
        if (blocked && candidate === blocked) {
            postponed.push(candidate)
            continue
        }

        if (postponed.length > 0) {
            challengeTripletRotationQueue.push(...postponed)
        }
        return candidate
    }

    // Si solo se postergó el bloqueado, reinicia cola y toma el siguiente.
    refillChallengeTripletRotationQueue(blocked)
    if (challengeTripletRotationQueue.length > 0) {
        return challengeTripletRotationQueue.shift() || null
    }

    // Fallback de seguridad extrema.
    const allValidTriplets = getAllValidChallengeTriplets()
    return allValidTriplets[0] || null
}

export const getRandomConsonantChallenge = (excludeConsonants?: string): GameChallenge => {
    const blocked = normalizeConsonantTriplet(excludeConsonants || '')

    const nextTriplet = pullNextChallengeTriplet(blocked)
    if (!nextTriplet) {
        throw new Error('[consonantWordGameServer] Failed to pull next challenge triplet.')
    }

    const challenge = buildChallengeFromTriplet(nextTriplet)
    if (!challenge) throw new Error('[consonantWordGameServer] Failed to build random challenge from rotation pool.')
    return challenge
}

export const getChallengeByConsonants = (consonants: string): GameChallenge | null =>
    buildChallengeFromTriplet(consonants)

export const getCatalogByConsonants = (consonants: string) => {
    const normalizedTriplet = normalizeConsonantTriplet(consonants)
    if (normalizedTriplet.length !== 3) return null

    const words = getCanonicalWordsForTriplet(normalizedTriplet)
    if (words.length === 0) return null
    const commonWords = getCommonWordsForTriplet(normalizedTriplet)

    return {
        consonants: normalizedTriplet,
        words,
        commonWords
    }
}

export const validateConsonantWord = ({
    consonants,
    rawWord
}: {
    consonants: string
    rawWord: string
}): ValidationResponse => {
    const normalizedTriplet = normalizeConsonantTriplet(consonants)
    if (normalizedTriplet.length !== 3) {
        return {
            tone: 'error',
            message: 'Reto invalido: consonantes no disponibles.',
            normalizedWord: null
        }
    }

    const normalizedWord = normalizeCandidateWord(rawWord)
    if (!normalizedWord) {
        return {
            tone: 'error',
            message: 'Escribe una palabra para validar.',
            normalizedWord: null
        }
    }

    if (!hasConsonantsInOrder(normalizedWord, normalizedTriplet)) {
        return {
            tone: 'error',
            message: `La palabra debe mantener el orden ${normalizedTriplet}.`,
            normalizedWord
        }
    }

    if (!index.dictionarySet.has(normalizedWord)) {
        if (index.nonConjugatedSet.has(normalizedWord) && isLikelyPlural({ word: normalizedWord, singularSet: index.nonConjugatedSet })) {
            const singularWord = resolveSingularWordForPlural({
                pluralWord: normalizedWord,
                triplet: normalizedTriplet,
                dictionarySet: index.dictionarySet,
                likelyVerbInfinitiveSet: index.likelyVerbInfinitiveSet
            })
            if (singularWord) {
                const canonicalSingular = resolveCanonicalWordForTriplet({
                    word: singularWord,
                    triplet: normalizedTriplet,
                    dictionarySet: index.dictionarySet
                })
                return {
                    tone: 'success',
                    message: `Palabra valida. Se registra como ${canonicalSingular}.`,
                    normalizedWord: canonicalSingular
                }
            }
            return {
                tone: 'error',
                message: 'No se aceptan palabras en plural en este juego.',
                normalizedWord
            }
        }
        let infinitiveFromConjugation = index.allDictionarySet.has(normalizedWord)
            ? resolveConjugatedInfinitive({
                word: normalizedWord,
                infinitiveSet: index.likelyVerbInfinitiveSet,
                lexiconSet: index.allDictionarySet
            })
            : null

        if (!infinitiveFromConjugation && index.allDictionarySet.has(normalizedWord)) {
            infinitiveFromConjugation = resolveFutureConditionalInfinitive({
                word: normalizedWord,
                infinitiveSet: index.infinitiveSet
            })
        }

        if (infinitiveFromConjugation && infinitiveFromConjugation !== normalizedWord) {
            if (normalizedWord.endsWith('emos')) {
                return {
                    tone: 'error',
                    message: 'No se aceptan conjugaciones verbales terminadas en "emos".',
                    normalizedWord
                }
            }
            if (!hasConsonantsInOrder(infinitiveFromConjugation, normalizedTriplet)) {
                return {
                    tone: 'error',
                    message: `La palabra base ${infinitiveFromConjugation} no cumple el orden ${normalizedTriplet}.`,
                    normalizedWord
                }
            }
            return {
                tone: 'success',
                message: `Palabra valida. Se registra como ${infinitiveFromConjugation}.`,
                normalizedWord: infinitiveFromConjugation
            }
        }
        const canonicalFromVariant = resolveCanonicalFromVariant({
            word: normalizedWord,
            triplet: normalizedTriplet,
            dictionarySet: index.dictionarySet
        })
        if (canonicalFromVariant) {
            return {
                tone: 'success',
                message: `Palabra valida. Se registra como ${canonicalFromVariant}.`,
                normalizedWord: canonicalFromVariant
            }
        }
        return {
            tone: 'error',
            message: 'La palabra no esta reconocida por el diccionario del juego.',
            normalizedWord
        }
    }

    const canonicalWord = resolveCanonicalWordForTriplet({
        word: normalizedWord,
        triplet: normalizedTriplet,
        dictionarySet: index.dictionarySet
    })

    return {
        tone: 'success',
        message: canonicalWord === normalizedWord
            ? 'Palabra valida.'
            : `Palabra valida. Se registra como ${canonicalWord}.`,
        normalizedWord: canonicalWord
    }
}

export const getConsonantDictionarySummary = () => ({
    dictionarySize: index.dictionaryWords.length,
    rawDictionarySize: index.allDictionarySet.size,
    challengePoolSize: getAllValidChallengeTriplets().length,
    challengeSeedPoolSize: index.tripletSeedPool.length
})
