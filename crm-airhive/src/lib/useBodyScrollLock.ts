'use client'

import { useEffect } from 'react'

let lockCount = 0
let previousOverflow = ''
let previousPaddingRight = ''
let previousHtmlOverflow = ''
let previousMainOverflow = ''

function lockBodyScroll() {
    if (typeof window === 'undefined') return

    const body = document.body
    const html = document.documentElement
    const main = document.getElementById('app-main-scroll')
    if (lockCount === 0) {
        previousOverflow = body.style.overflow
        previousPaddingRight = body.style.paddingRight
        previousHtmlOverflow = html.style.overflow
        previousMainOverflow = main?.style.overflow ?? ''

        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
        body.style.overflow = 'hidden'
        html.style.overflow = 'hidden'
        if (main) main.style.overflow = 'hidden'
        if (scrollbarWidth > 0) {
            body.style.paddingRight = `${scrollbarWidth}px`
        }
    }
    lockCount += 1
}

function unlockBodyScroll() {
    if (typeof window === 'undefined') return
    if (lockCount === 0) return

    lockCount -= 1
    if (lockCount === 0) {
        const body = document.body
        const html = document.documentElement
        const main = document.getElementById('app-main-scroll')
        body.style.overflow = previousOverflow
        body.style.paddingRight = previousPaddingRight
        html.style.overflow = previousHtmlOverflow
        if (main) main.style.overflow = previousMainOverflow
    }
}

export function useBodyScrollLock(locked: boolean) {
    useEffect(() => {
        if (!locked) return
        lockBodyScroll()
        return () => unlockBodyScroll()
    }, [locked])
}
