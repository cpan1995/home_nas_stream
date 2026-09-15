const seededRandom = (seed: number) => () => {
    let value = seed

    return () => {
        value = (value * 16807) % 2147483647
        return (value - 1) / 2147483646
    }
}

export const shuffle = <T>(array: readonly T[], seed = 1): T[] => {
    const random = seededRandom(seed)()

    return array.reduceRight<T[]>(
        (acc, _, i) => {
            const j = Math.floor(random() * (i + 1))

            const next = [...acc]
            ;[next[i], next[j]] = [next[j], next[i]]

            return next
        },
        [...array]
    )
}
