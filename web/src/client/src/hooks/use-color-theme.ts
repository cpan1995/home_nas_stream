import { createContext, useContext } from "react"

export const colorThemes = [
    { id: "red", label: "Red", color: "oklch(0.62 0.25 15)" },
    { id: "rose", label: "Rose", color: "oklch(0.65 0.22 340)" },
    { id: "purple", label: "Purple", color: "oklch(0.62 0.22 285)" },
    { id: "blue", label: "Blue", color: "oklch(0.60 0.22 240)" },
    { id: "sky", label: "Sky", color: "oklch(0.65 0.18 205)" },
    { id: "green", label: "Green", color: "oklch(0.62 0.22 145)" },
    { id: "amber", label: "Amber", color: "oklch(0.70 0.19 65)" },
] as const

export type ColorThemeId = (typeof colorThemes)[number]["id"]

export type ColorThemeContextType = {
    colorTheme: ColorThemeId
    setColorTheme: (theme: ColorThemeId) => void
}

export const ColorThemeContext = createContext<ColorThemeContextType | null>(null)

export function useColorTheme() {
    const ctx = useContext(ColorThemeContext)
    if (!ctx) throw new Error("useColorTheme must be used within ColorThemeProvider")
    return ctx
}
