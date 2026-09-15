import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import ipaddr from "ipaddr.js"
import { Agent, fetch as request } from "undici"

export function isPublicAddress(address: string) {
    try { return ipaddr.process(address).range() === "unicast" } catch { return false }
}

export function validateDestination(value: string | URL) {
    const url = new URL(value)
    const host = url.hostname.replace(/^\[|\]$/g, "")
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        (url.port && !["80", "443"].includes(url.port)) || host === "localhost" ||
        host.endsWith(".localhost") || (isIP(host) && !isPublicAddress(host)))
        throw Error("Outbound destination blocked")
    return url
}

// Validate DNS at connection time to prevent public hostnames resolving to a private network.
const dispatcher = new Agent({ connect: {
    timeout: 10000,
    lookup(hostname, options, callback) {
        lookup(hostname, { all: true, verbatim: true }).then(records => {
            if (!records.length || records.some(record => !isPublicAddress(record.address))) {
                callback(Error("Private-network DNS destination blocked"), "", 4)
                return
            }
            const matches = options.family ? records.filter(record => record.family === options.family) : records
            if (!matches.length) { callback(Error("No supported public address"), "", 4); return }
            if (options.all) callback(null, matches)
            else callback(null, matches[0].address, matches[0].family)
        }, () => callback(Error("Provider DNS lookup failed"), "", 4))
    },
} })

export async function publicFetch(input: string | URL, init: RequestInit = {}, timeoutMs: number | null = 20000) {
    let url = validateDestination(input)
    const headers = new Headers(init.headers)
    const deadline = timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs)
    const signal = deadline && init.signal ? AbortSignal.any([init.signal, deadline]) : init.signal || deadline
    for (let redirects = 0; redirects <= 5; redirects++) {
        const response = await request(url, { method: "GET", headers: Object.fromEntries(headers.entries()), signal, dispatcher, redirect: "manual" })
        if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.get("location")) return response
        const next = validateDestination(new URL(response.headers.get("location")!, url))
        await response.body?.cancel()
        if (next.origin !== url.origin) { headers.delete("authorization"); headers.delete("cookie") }
        url = next
    }
    throw Error("Too many provider redirects")
}
