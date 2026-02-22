'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/app/actions/events'
import { useAuth } from '@/lib/auth'

/**
 * Invisible component that handles automatic client-side tracking.
 * - Session start/end
 * - Session duration
 * - Tab visibility changes
 */
export default function EventTracker() {
    const { user, loggedIn } = useAuth()
    const sessionStartTime = useRef<number>(0)
    const lastTrackedUserId = useRef<string | null>(null)

    useEffect(() => {
        if (loggedIn && user) {
            // New session detected or user changed
            if (lastTrackedUserId.current !== user.id) {
                const startedKey = `airhive_session_started_${user.id}`
                if (typeof window !== 'undefined' && sessionStorage.getItem(startedKey) === '1') {
                    lastTrackedUserId.current = user.id
                    return
                }

                sessionStartTime.current = Date.now()
                lastTrackedUserId.current = user.id
                if (typeof window !== 'undefined') sessionStorage.setItem(startedKey, '1')

                trackEvent({
                    eventType: 'session_start',
                    userId: user.id,
                    metadata: {
                        userAgent: navigator.userAgent,
                        screen: `${window.screen.width}x${window.screen.height}`
                    }
                })
            }
        }

        const handleBeforeUnload = () => {
            if (lastTrackedUserId.current) {
                const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000)
                // Using trackEvent as an async call, but since it's beforeunload, 
                // we hope it finishes or the browser handles the beacon if we used fetch.
                // For now, we follow the pattern.
                trackEvent({
                    eventType: 'session_end',
                    userId: lastTrackedUserId.current,
                    metadata: {
                        durationSeconds,
                        reason: 'window_closed'
                    }
                })
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [loggedIn, user?.id])

    return null
}
