import { useRef, useState, type RefObject } from "react"
import { remoteFocus } from "./RemoteNavigation"

export function RemoteKeyboard({ input, value, change, done, doneLabel = "Results" }: {
    input: RefObject<HTMLInputElement | null>; value: string; change: (value: string) => void; done: () => void; doneLabel?: string
}) {
    const [symbols, setSymbols] = useState(false)
    const [lowercase, setLowercase] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const column = useRef(0)
    const letters = (text: string) => (lowercase ? text.toLowerCase() : text).split("")
    const rows = symbols ? ["1234567890".split(""), "-:.'!?&()/".split(""), ["ABC", ..."_@#%=+", "Delete"], ["Space", "Clear", "Aa", doneLabel]] :
        [letters("QWERTYUIOP"), letters("ASDFGHJKL"), ["123", ...letters("ZXCVBNM"), "Delete"], ["Space", "Clear", "Aa", doneLabel]]
    const edit = (key: string) => {
        if (key === "123" || key === "ABC") { setSymbols(!symbols); return }
        if (key === "Aa") { setLowercase(!lowercase); return }
        if (key === doneLabel) { done(); return }
        const start = input.current?.selectionStart ?? value.length
        const end = input.current?.selectionEnd ?? start
        const from = key === "Delete" && start === end ? Math.max(0, start - 1) : start
        const text = key === "Delete" || key === "Clear" ? "" : key === "Space" ? " " : key
        change(key === "Clear" ? "" : value.slice(0, from) + text + value.slice(end))
        requestAnimationFrame(() => input.current?.setSelectionRange(key === "Clear" ? 0 : from + text.length, key === "Clear" ? 0 : from + text.length))
    }
    return <div ref={root} className="remote-keyboard" data-remote-keyboard aria-label="On-screen keyboard" onKeyDown={event => {
        const key = event.key
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (key === "Backspace") { event.preventDefault(); edit("Delete"); return }
        if (key.length === 1 && key !== " ") { event.preventDefault(); edit(key); return }
        if (!key.startsWith("Arrow")) return
        event.preventDefault(); event.stopPropagation()
        const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>("button")]
        const current = event.target as HTMLButtonElement
        const row = Number(current.dataset.row), index = Number(current.dataset.column)
        const inRow = (r: number) => buttons.filter(button => Number(button.dataset.row) === r)
        if (key === "ArrowLeft" || key === "ArrowRight") {
            const next = index + (key === "ArrowRight" ? 1 : -1)
            if (next >= inRow(row).length) { if (doneLabel === "Results") done(); return }
            column.current = Math.max(0, next)
            remoteFocus(inRow(row)[column.current])
        } else if (key === "ArrowUp" && row === 0) remoteFocus(input.current)
        else {
            const nextRow = row + (key === "ArrowDown" ? 1 : -1)
            if (nextRow >= rows.length) { if (doneLabel === "Results") done(); return }
            remoteFocus(inRow(nextRow)[Math.min(column.current, inRow(nextRow).length - 1)])
        }
    }}>
        {rows.map((keys, row) => <div className="remote-key-row" key={row}>{keys.map((key, index) =>
            <button type="button" key={`${row}-${index}`} data-row={row} data-column={index} aria-label={key}
                onClick={() => edit(key)}>{key === "Delete" ? "⌫" : key}</button>)}</div>)}
    </div>
}
