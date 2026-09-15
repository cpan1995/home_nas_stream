export function formatTime(seconds: number): string {
    if (isNaN(seconds)) return "00:00"

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = Math.floor(seconds % 60)

    const parts = []

    if (hours > 0) {
        parts.push(hours.toString().padStart(2, "0"))
    }

    parts.push(minutes.toString().padStart(2, "0"))
    parts.push(remainingSeconds.toString().padStart(2, "0"))

    return parts.join(":")
}
