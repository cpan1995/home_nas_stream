import type { HistoryItem } from "@/app/providers/history-provider"

export function getHistoryKey(entry: HistoryItem) {
    switch (entry.kind) {
        case "movie":
            return `movie:${entry.item.id}`
        case "tvShow":
            return `episode:${entry.item.show_id}:${entry.item.season_number}:${entry.item.episode_number}`
    }
}

export function mergeHistory(current: HistoryItem[], incoming: HistoryItem[]) {
    const map = new Map<string, HistoryItem>()

    for (const entry of [...incoming, ...current]) {
        map.set(getHistoryKey(entry), entry)
    }

    return [...map.values()]
}
