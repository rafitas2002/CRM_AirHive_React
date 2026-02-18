export type RaceMedal = 'gold' | 'silver' | 'bronze' | null

export interface RankedRaceItem<T> {
    item: T
    value: number
    rank: number
    medal: RaceMedal
    isZeroValue: boolean
}

export function rankRaceItems<T>(
    items: T[],
    getValue: (item: T) => number
): RankedRaceItem<T>[] {
    const sorted = [...items].sort((a, b) => getValue(b) - getValue(a))
    const positive = sorted.filter((item) => getValue(item) > 0)
    const zeroOrLess = sorted.filter((item) => getValue(item) <= 0)

    const rankedPositive: RankedRaceItem<T>[] = []
    let previousValue: number | null = null
    let currentRank = 1

    positive.forEach((item, index) => {
        const value = getValue(item)
        if (previousValue === null) {
            currentRank = 1
        } else if (value !== previousValue) {
            // Competition ranking with ties: 1,1,3...
            currentRank = index + 1
        }

        let medal: RaceMedal = null
        if (currentRank === 1) medal = 'gold'
        if (currentRank === 2) medal = 'silver'
        if (currentRank === 3) medal = 'bronze'

        rankedPositive.push({
            item,
            value,
            rank: currentRank,
            medal,
            isZeroValue: false
        })
        previousValue = value
    })

    const zeroRank = Math.max(4, positive.length + 1)
    const rankedZero = zeroOrLess.map((item) => ({
        item,
        value: getValue(item),
        rank: zeroRank,
        medal: null,
        isZeroValue: true
    }))

    return [...rankedPositive, ...rankedZero]
}
