// Keep the installed Core/TMDB credentials on the local server.
// The upstream TMDB SDK has no custom transport option.
if (import.meta.env.VITE_LOCAL_API === "true") {
    const nativeFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        if (url.origin !== "https://api.themoviedb.org") return nativeFetch(input, init)
        url.searchParams.delete("api_key")
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        headers.delete("Authorization")
        return nativeFetch(`/api/tmdb${url.pathname}${url.search}`, { ...init, headers })
    }
}
