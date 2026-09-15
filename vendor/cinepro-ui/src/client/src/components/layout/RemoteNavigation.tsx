import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { screeningRoom } from "@/lib/screening-room"

const selector = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="combobox"], [tabindex="0"]'
const overlays = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
export function remoteVisible(node: HTMLElement) {
    return (!document.fullscreenElement || document.fullscreenElement.contains(node)) &&
        !node.matches(':disabled, [data-remote-ignore]') &&
        (!node.matches('[aria-disabled="true"]') || node.hasAttribute('data-remote-unavailable')) &&
        !node.closest('[hidden], [inert], [aria-hidden="true"], [role="dialog"][data-state="closed"], [role="menu"][data-state="closed"], [role="listbox"][data-state="closed"]') &&
        node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0 &&
        getComputedStyle(node).visibility !== "hidden"
}
export function remoteFocus(node?: HTMLElement | null) {
    if (!node) return
    node.focus({ preventScroll: true })
    // Embla owns horizontal scrolling; its focus handler reveals the selected card.
    const slide = node.closest<HTMLElement>('[data-slot="carousel"]')
    if (slide) slide.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" })
    else node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" })
}

function focusId(node: HTMLElement) {
    const rail = node.closest('[data-remote-rail]')
    const index = rail ? [...document.querySelectorAll('[data-remote-rail]')].indexOf(rail) : -1
    return `${index}:${node.dataset.remoteId}`
}

export function RemoteNavigation() {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const navigateRef = useRef(navigate)
    navigateRef.current = navigate
    const route = useRef(pathname)
    const remembered = useRef(new Map<string, string>())
    const pendingRestore = useRef<string | null>(null)
    useEffect(() => {
        if (!screeningRoom) return
        document.documentElement.dataset.remote = "true"
        let scope: HTMLElement = document.body
        let frame = 0
        let lastFocus: HTMLElement | null = null
        const rowMemory = new WeakMap<HTMLElement, HTMLElement>()
        const stack: { scope: HTMLElement; returnTo: HTMLElement | null }[] = []
        const controls = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(selector)].filter(remoteVisible)
        const defaultFocus = () => {
            const saved = remembered.current.get(route.current)
            const match = saved ? controls(scope).find(node => focusId(node) === saved) : undefined
            return match || controls(scope).find(node => node.hasAttribute("data-remote-default")) ||
                scope.querySelector<HTMLElement>(`header a[href="${route.current}"]`) || controls(scope)[0]
        }
        const recover = () => {
            frame = 0
            const visibleScopes = [...document.querySelectorAll<HTMLElement>(overlays)].filter(remoteVisible)
            const nextScope = visibleScopes[visibleScopes.length - 1] || document.body
            if (nextScope === document.body && pendingRestore.current) {
                const restored = controls(document.body).find(node => focusId(node) === pendingRestore.current)
                if (restored) { pendingRestore.current = null; remoteFocus(restored) }
            }
            if (scope !== nextScope) {
                const prior = stack.findIndex(entry => entry.scope === nextScope)
                if (prior >= 0 || nextScope === document.body) {
                    const entry = stack.splice(prior >= 0 ? prior + 1 : 0)[0]
                    scope = nextScope
                    // A menu may finish closing after the user has already moved on.
                    // Restore only when focus has actually left the surviving scope.
                    const active = document.activeElement as HTMLElement
                    if ((!scope.contains(active) || active === document.body || !remoteVisible(active)) &&
                        entry?.returnTo?.isConnected && remoteVisible(entry.returnTo)) remoteFocus(entry.returnTo)
                } else {
                    stack.push({ scope: nextScope, returnTo: lastFocus })
                    scope = nextScope
                    if (!scope.contains(document.activeElement)) remoteFocus(defaultFocus())
                }
            }
            const active = document.activeElement as HTMLElement
            if (!scope.contains(active) || active === document.body || !remoteVisible(active)) remoteFocus(defaultFocus())
        }
        const schedule = () => { if (!frame) frame = requestAnimationFrame(recover) }
        const focus = (event: FocusEvent) => {
            const target = event.target as HTMLElement
            if (!target.matches(selector)) return
            const overlay = target.closest(overlays)
            if ((scope === document.body && overlay) || (scope !== document.body && overlay !== scope)) return
            lastFocus = target
            const row = target.closest<HTMLElement>('[data-remote-row]')
            if (row) rowMemory.set(row, target)
            if (scope === document.body && target.dataset.remoteId && !pendingRestore.current) remembered.current.set(route.current, focusId(target))
        }
        const keydown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement
            if (target.closest(overlays)) recover()
            if (event.altKey || event.ctrlKey || event.metaKey) return
            if (event.key.startsWith("Arrow") || event.key === "Enter") pendingRestore.current = null
            const editing = target.matches('input:not([type="range"]), textarea, [contenteditable="true"]')
            if (target.closest('[data-remote-keyboard]') && event.key === "Backspace") return
            const back = event.key === "Escape" || event.key === "BrowserBack" || (event.key === "Backspace" && !editing)
            if (back) {
                if (event.repeat) { event.preventDefault(); event.stopPropagation(); return }
                if (document.fullscreenElement && scope === document.body) { event.preventDefault(); document.exitFullscreen(); return }
                if (scope !== document.body) {
                    if (event.key !== "Escape") {
                        event.preventDefault(); event.stopPropagation()
                        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
                    }
                    return // Radix closes only the top dialog/menu and restores its trigger.
                }
                event.preventDefault(); event.stopPropagation()
                if (route.current.startsWith("/watch/") || route.current !== "/movies") {
                    if (history.state?.idx > 0) navigateRef.current(-1)
                    else navigateRef.current("/movies")
                } else remoteFocus(document.querySelector<HTMLElement>('[data-remote-nas]'))
                return
            }
            if (event.key === "Enter" && event.repeat) { event.preventDefault(); event.stopPropagation(); return }
            if (target.closest("[data-cinema-player]") && !target.closest(overlays)) return // Player owns the NAS control order and shortcuts.
            // These widgets already implement their own list selection and value adjustment.
            if (target.closest('[role="menu"], [role="listbox"]') || target.matches('select') ||
                (target.matches('[role="slider"], input[type="range"]') && event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
                (target.getAttribute("role") === "combobox" && (target.getAttribute("aria-expanded") === "true" || event.key === "Enter" || (target.tagName === "INPUT" && event.key === "ArrowDown")))) return
            if (target.closest('[data-remote-keyboard]')) return
            if (target.matches('[data-remote-input]') && (event.key === "ArrowDown" || event.key === "Enter")) return
            if (target.closest('[data-remote-results]') && event.key === "ArrowLeft") return
            if (event.key === "Enter" && target instanceof HTMLInputElement && editing && !target.readOnly) {
                event.preventDefault(); event.stopPropagation()
                window.dispatchEvent(new CustomEvent("screening-room-edit", { detail: target }))
                return
            }
            if (event.key === "Enter" && target.matches('[role="button"]:not(button), [role="checkbox"], [role="switch"]')) {
                event.preventDefault(); event.stopPropagation(); target.click(); return
            }
            if (!event.key.startsWith("Arrow")) return
            if (editing && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return
            if (target.getAttribute("role") === "tab" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return
            event.preventDefault(); event.stopPropagation()
            recover()
            const current = document.activeElement as HTMLElement
            if (event.key === "ArrowDown" && current.closest('.tv-header')) {
                const main = document.querySelector<HTMLElement>('main')
                if (main) remoteFocus(controls(main).find(node => node.hasAttribute('data-remote-default')) || controls(main)[0])
                return
            }
            const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight"
            const sign = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1
            const row = current.closest<HTMLElement>('[data-remote-row]')
            if (horizontal && row) {
                const items = controls(row)
                const index = items.indexOf(current)
                const next = items[index + sign]
                if (next) remoteFocus(next)
                else if (current.closest('.tv-header') && sign < 0) remoteFocus(document.querySelector<HTMLElement>('[data-remote-nas]'))
                return
            }
            // Keep horizontal movement inside the current grid line.
            const grid = current.closest<HTMLElement>('[data-remote-grid]')
            if (horizontal && grid) {
                const items = controls(grid)
                const next = items[items.indexOf(current) + sign]
                if (next && Math.abs(next.getBoundingClientRect().top - current.getBoundingClientRect().top) < 5) remoteFocus(next)
                return
            }
            const origin = current.getBoundingClientRect()
            const candidates = controls(scope).filter(node => node !== current && (horizontal || !row || !row.contains(node))).map(node => {
                const rect = node.getBoundingClientRect()
                const dx = rect.x + rect.width / 2 - origin.x - origin.width / 2
                const dy = rect.y + rect.height / 2 - origin.y - origin.height / 2
                const beam = horizontal ? rect.top < origin.bottom && rect.bottom > origin.top : rect.left < origin.right && rect.right > origin.left
                const forward = (horizontal ? dx : dy) * sign
                return { node, rect, forward, score: forward + Math.abs(horizontal ? dy : dx) * 3 + (beam ? 0 : 1000) }
            }).filter(item => item.forward > 2 && (horizontal || (item.rect.right > 0 && item.rect.left < innerWidth)))
                .sort((a, b) => a.score - b.score)
            let next = candidates[0]?.node
            const nextRow = next?.closest<HTMLElement>('[data-remote-row]')
            const savedInRow = nextRow && rowMemory.get(nextRow)
            if (!horizontal && savedInRow?.isConnected && remoteVisible(savedInRow)) next = savedInRow
            remoteFocus(next)
        }
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "inert", "aria-hidden", "data-state"] })
        document.addEventListener("keydown", keydown, true)
        document.addEventListener("focusin", focus)
        schedule()
        return () => {
            observer.disconnect(); cancelAnimationFrame(frame)
            document.removeEventListener("keydown", keydown, true)
            document.removeEventListener("focusin", focus)
            delete document.documentElement.dataset.remote
        }
    }, [])
    useEffect(() => {
        if (!screeningRoom || route.current === pathname) return
        route.current = pathname
        pendingRestore.current = remembered.current.get(pathname) || null
        const frame = requestAnimationFrame(() => {
            const saved = remembered.current.get(pathname)
            const target = [...document.querySelectorAll<HTMLElement>('[data-remote-id]')].find(node => focusId(node) === saved && remoteVisible(node))
            if (target) pendingRestore.current = null
            remoteFocus(target || document.querySelector<HTMLElement>(`header a[href="${pathname}"]`) || document.querySelector<HTMLElement>('[data-remote-default]'))
        })
        return () => cancelAnimationFrame(frame)
    }, [pathname])
    return null
}
