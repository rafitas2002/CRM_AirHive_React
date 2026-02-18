'use client'

import { useEffect } from 'react'

let lockCount = 0
let previousOverflow = ''
let previousPaddingRight = ''

function lockBodyScroll() {
    if (typeof window === 'undefined') return

    const body = document.body
    if (lockCount === 0) {
        previousOverflow = body.style.overflow
        previousPaddingRight = body.style.paddingRight

        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
        body.style.overflow = 'hidden'
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
        body.style.overflow = previousOverflow
        body.style.paddingRight = previousPaddingRight
    }
}

export function useBodyScrollLock(locked: boolean) {
    useEffect(() => {
        if (!locked) return
        lockBodyScroll()
        return () => unlockBodyScroll()
    }, [locked])
}

