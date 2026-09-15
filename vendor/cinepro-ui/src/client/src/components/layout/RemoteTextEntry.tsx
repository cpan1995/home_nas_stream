import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { RemoteKeyboard } from "./RemoteKeyboard"
import { remoteFocus } from "./RemoteNavigation"

export function RemoteTextEntry() {
    const [target, setTarget] = useState<HTMLInputElement | null>(null)
    const [value, setValue] = useState("")
    const input = useRef<HTMLInputElement>(null)
    const returnTo = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
        const open = (event: Event) => {
            const field = (event as CustomEvent<HTMLInputElement>).detail
            returnTo.current = field
            setValue(field.value); setTarget(field)
        }
        window.addEventListener("screening-room-edit", open)
        return () => window.removeEventListener("screening-room-edit", open)
    }, [])
    const save = () => {
        if (target?.isConnected) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(target, value)
            target.dispatchEvent(new Event("input", { bubbles: true }))
        }
        setTarget(null)
    }
    return <Dialog open={Boolean(target)} onOpenChange={open => { if (!open) setTarget(null) }}>
        <DialogContent onOpenAutoFocus={event => { event.preventDefault(); remoteFocus(input.current) }}
            onCloseAutoFocus={event => { event.preventDefault(); remoteFocus(returnTo.current) }}>
            <DialogTitle>Edit {target?.labels?.[0]?.textContent || target?.getAttribute("aria-label") || "text"}</DialogTitle>
            <DialogDescription>Choose Done to save, or Back to cancel.</DialogDescription>
            <input ref={input} data-remote-default data-remote-input aria-label="Edit text" value={value} className="rounded border p-3" onChange={event => setValue(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === "ArrowDown") { event.preventDefault(); remoteFocus(input.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>('[data-remote-keyboard] button')) } }} />
            <RemoteKeyboard input={input} value={value} change={setValue} done={save} doneLabel="Done" />
        </DialogContent>
    </Dialog>
}
