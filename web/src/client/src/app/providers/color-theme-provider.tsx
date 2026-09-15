import React, { useEffect } from "react"
import { ColorThemeContext, type ColorThemeId } from "@/hooks/use-color-theme"
import { usePersistentState } from "@/hooks/use-localstorage"

function applyColorTheme(theme: ColorThemeId) {
    if (theme === "red") {
        document.documentElement.removeAttribute("data-color-theme")
    } else {
        document.documentElement.setAttribute("data-color-theme", theme)
    }
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
    const [colorTheme, setColorTheme] = usePersistentState<ColorThemeId>("app.colorTheme", "red")

    useEffect(() => {
        applyColorTheme(colorTheme)
    }, [colorTheme])

    return <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>{children}</ColorThemeContext.Provider>
}
