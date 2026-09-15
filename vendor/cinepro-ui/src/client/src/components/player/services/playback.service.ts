export const playbackService = {
    // Can add logic for saving/loading progress to localStorage or API here
    saveProgress: (id: string, time: number) => {
        localStorage.setItem(`playback_progress_${id}`, time.toString())
    },

    getProgress: (id: string): number => {
        const saved = localStorage.getItem(`playback_progress_${id}`)
        return saved ? parseFloat(saved) : 0
    },
}
