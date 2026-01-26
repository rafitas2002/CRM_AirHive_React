'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'claro' | 'gris' | 'oscuro'

type ThemeContextType = {
    theme: Theme
    setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const THEME_STORAGE_KEY = 'airhive-crm-theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('claro')
    const [mounted, setMounted] = useState(false)

    // Load theme from localStorage on mount
    useEffect(() => {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
        if (storedTheme && ['claro', 'gris', 'oscuro'].includes(storedTheme)) {
            setThemeState(storedTheme)
        }
        setMounted(true)
    }, [])

    // Update localStorage and apply theme whenever it changes
    useEffect(() => {
        if (!mounted) return

        localStorage.setItem(THEME_STORAGE_KEY, theme)

        // Apply theme class to document root
        document.documentElement.classList.remove('theme-claro', 'theme-gris', 'theme-oscuro')
        document.documentElement.classList.add(`theme-${theme}`)
    }, [theme, mounted])

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme)
    }

    // Prevent flash of unstyled content
    if (!mounted) {
        return null
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
