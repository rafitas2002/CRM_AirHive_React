'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const CHICKEN_SPAWN_PROBABILITY = 1 // prueba solicitada: 100%
const BUTTON_FREEZE_MS = 60_000
const CHICKEN_MAX_SPEED_PX_PER_SEC = 1180
const CHICKEN_ACCELERATION_PX_PER_SEC2 = 6_200
const CHICKEN_FRICTION = 0.968
const PECK_DISTANCE_PX = 34
const PECK_COOLDOWN_MS = 800
const PECK_ANIMATION_MS = 180
const EGG_TARGET_COUNT = 10
const EGG_LIFETIME_MS = 4_000
const EGG_HIT_DISTANCE_PX = 46
const EGG_SPAWN_MARGIN_PX = 86

type CursorPoint = {
    x: number
    y: number
}

type ChickenRuntime = {
    active: boolean
    x: number
    y: number
    vx: number
    vy: number
    angleDeg: number
    lastPeckAt: number
    peckUntil: number
}

type ChickenFrameState = {
    visible: boolean
    x: number
    y: number
    angleDeg: number
    pecking: boolean
}

type PeckImpactState = {
    x: number
    y: number
    expiresAt: number
}

type EggState = {
    id: number
    x: number
    y: number
    spawnedAt: number
    expiresAt: number
}

function isButtonLikeTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null
    const selector = [
        'button',
        '[role="button"]',
        'input[type="button"]',
        'input[type="submit"]',
        'input[type="reset"]'
    ].join(', ')
    const element = target.closest(selector)
    if (!(element instanceof HTMLElement)) return null
    if (element.dataset.chickenIgnore === 'true') return null
    return element
}

function getRandomEdgeSpawnPoint(viewportWidth: number, viewportHeight: number): CursorPoint {
    const margin = 52
    const side = Math.floor(Math.random() * 4)
    if (side === 0) {
        return { x: -margin, y: Math.random() * viewportHeight }
    }
    if (side === 1) {
        return { x: viewportWidth + margin, y: Math.random() * viewportHeight }
    }
    if (side === 2) {
        return { x: Math.random() * viewportWidth, y: -margin }
    }
    return { x: Math.random() * viewportWidth, y: viewportHeight + margin }
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function formatMsAsMinSec(ms: number) {
    const seconds = Math.max(0, Math.ceil(ms / 1000))
    const minutesPart = Math.floor(seconds / 60)
    const secondsPart = seconds % 60
    return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`
}

function ChickenFullBodyArt({ facingLeft, pecking }: { facingLeft: boolean; pecking: boolean }) {
    const headTranslate = pecking ? 15 : 0
    const wingAnimation = pecking
        ? 'ah-chicken-wing-flap-aggressive 42ms cubic-bezier(0.22, 1, 0.36, 1) infinite alternate'
        : 'ah-chicken-wing-flap 108ms ease-in-out infinite alternate'
    const bodyAnimation = pecking
        ? 'ah-chicken-body-bob 78ms ease-in-out infinite'
        : 'ah-chicken-body-bob 170ms ease-in-out infinite'
    const headAnimation = pecking
        ? 'ah-chicken-head-peck 52ms linear infinite'
        : 'ah-chicken-head-bob 180ms ease-in-out infinite'
    const legAnimation = pecking
        ? 'ah-chicken-leg-run 58ms ease-in-out infinite alternate'
        : 'ah-chicken-leg-run 104ms ease-in-out infinite alternate'
    const tailAnimation = pecking
        ? 'ah-chicken-tail-wag 68ms ease-in-out infinite alternate'
        : 'ah-chicken-tail-wag 112ms ease-in-out infinite alternate'

    return (
        <svg
            width='114'
            height='86'
            viewBox='0 0 114 86'
            aria-hidden='true'
            style={{
                overflow: 'visible',
                transform: `scaleX(${facingLeft ? -1 : 1})`
            }}
        >
            <ellipse cx='57' cy='75' rx='29' ry='6' fill='rgba(15, 23, 42, 0.22)' />

            <g transform='translate(0 0)'>
                <g
                    transform='translate(16 10)'
                    style={{
                        transformOrigin: '26px 26px',
                        animation: tailAnimation
                    }}
                >
                    <path d='M8 38 C2 28, 2 17, 11 11 C16 8, 18 15, 22 17 C17 21, 19 28, 16 33 C14 37, 11 40, 8 38Z' fill='#d97706' opacity='0.95' />
                    <path d='M13 34 C8 27, 9 18, 18 12 C24 8, 25 17, 28 20 C24 22, 26 29, 22 33 C20 36, 16 37, 13 34Z' fill='#f59e0b' opacity='0.95' />
                </g>

                <g
                    style={{
                        transformOrigin: '58px 44px',
                        animation: bodyAnimation
                    }}
                >
                    <g
                        style={{
                            transformOrigin: '48px 47px',
                            animation: wingAnimation,
                            opacity: pecking ? 0.84 : 0.72,
                            filter: pecking ? 'drop-shadow(0 0 3px rgba(251,191,36,0.2))' : undefined
                        }}
                    >
                        <path
                            d='M33 46 C30 33, 39 27, 49 31 C57 35, 59 47, 54 55 C43 58, 36 53, 33 46Z'
                            fill='#f59e0b'
                            stroke='#b45309'
                            strokeWidth='1.6'
                        />
                        <path d='M36 44 C37 37, 44 35, 49 39 C44 42, 41 46, 37 49Z' fill='#fde68a' opacity='0.8' />
                    </g>

                    <ellipse cx='58' cy='44' rx='34' ry='24' fill='#fef3c7' stroke='#b45309' strokeWidth='2.2' />
                    <ellipse cx='60' cy='46' rx='28' ry='18' fill='#fde68a' opacity='0.82' />
                    <path d='M45 43 C52 33, 69 31, 79 42 C69 50, 58 52, 45 43Z' fill='#fbbf24' opacity='0.9' />
                    <path d='M46 47 C53 42, 61 41, 70 47 C64 53, 56 54, 46 47Z' fill='#f59e0b' opacity='0.62' />

                    <g
                        style={{
                            transformOrigin: '58px 47px',
                            animation: `${wingAnimation} -26ms`,
                            filter: pecking ? 'drop-shadow(0 0 4px rgba(245,158,11,0.22))' : undefined
                        }}
                    >
                        <path
                            d='M44 48 C42 34, 54 28, 66 34 C76 39, 77 53, 69 60 C57 62, 47 58, 44 48Z'
                            fill='#fbbf24'
                            stroke='#b45309'
                            strokeWidth='1.8'
                        />
                        <path d='M48 46 C52 39, 60 39, 65 44 C58 46, 54 49, 50 54Z' fill='#fff7d6' opacity='0.7' />
                    </g>
                </g>

                <g
                    transform={`translate(${headTranslate} 0)`}
                    style={{
                        transformOrigin: '85px 29px',
                        animation: headAnimation
                    }}
                >
                    <path d='M76 33 C76 26, 80 20, 87 19 C91 18, 94 20, 96 24 C92 27, 90 30, 88 34 C84 35, 80 35, 76 33Z' fill='#fbbf24' opacity='0.8' />
                    <circle cx='87' cy='27' r='14' fill='#fff7d6' stroke='#b45309' strokeWidth='2' />
                    <circle cx='90' cy='29' r='9.5' fill='#fde68a' opacity='0.9' />
                    <path d='M79 15 C81 9, 86 7, 89 12 C92 6, 98 7, 98 13 C102 11, 104 15, 102 18 C99 21, 84 22, 79 15Z' fill='#ef4444' />
                    <circle cx='91' cy='24' r='2.2' fill='#111827' />
                    <circle cx='91.8' cy='23.2' r='0.7' fill='white' opacity='0.85' />
                    <path d='M99 27 L111 24 L101 32 Z' fill='#f97316' stroke='#c2410c' strokeWidth='1.2' />
                    <path d='M98 31 C96 35, 92 36, 90 34 C93 33, 95 32, 98 31Z' fill='#dc2626' opacity='0.9' />
                </g>

                <g>
                    <g
                        style={{
                            transformOrigin: '42px 64px',
                            animation: legAnimation
                        }}
                    >
                        <path d='M42 63 L38 76' stroke='#b45309' strokeWidth='3.4' strokeLinecap='round' />
                        <path d='M39 76 L34 81' stroke='#b45309' strokeWidth='2.2' strokeLinecap='round' />
                        <path d='M39 76 L40 82' stroke='#b45309' strokeWidth='2.2' strokeLinecap='round' />
                        <path d='M39 76 L45 80' stroke='#b45309' strokeWidth='2.2' strokeLinecap='round' />
                    </g>

                    <g
                        style={{
                            transformOrigin: '61px 64px',
                            animation: `${legAnimation} ${pecking ? '-45ms' : '-70ms'}`
                        }}
                    >
                        <path d='M61 64 L58 77' stroke='#b45309' strokeWidth='3.4' strokeLinecap='round' />
                        <path d='M58 77 L53 82' stroke='#b45309' strokeWidth='2.2' strokeLinecap='round' />
                        <path d='M58 77 L59 83' stroke='#b45309' strokeWidth='2.2' strokeLinecap='round' />
                        <path d='M58 77 L64 81' stroke='#b45309' strokeWidth='2.2' strokeLinecap='round' />
                    </g>
                </g>
            </g>
        </svg>
    )
}

export default function GlobalChickenChaosHandler() {
    const chickenRef = useRef<ChickenRuntime>({
        active: false,
        x: -9999,
        y: -9999,
        vx: 0,
        vy: 0,
        angleDeg: 0,
        lastPeckAt: 0,
        peckUntil: 0
    })
    const cursorRef = useRef<CursorPoint>({
        x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0,
        y: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0
    })
    const eggRef = useRef<EggState | null>(null)
    const eggSeqRef = useRef(0)
    const eggsCollectedRef = useRef(0)
    const rafRef = useRef<number | null>(null)
    const lastFrameTsRef = useRef<number | null>(null)
    const freezeUntilRef = useRef<number>(0)
    const frozenRef = useRef(false)
    const [clockNow, setClockNow] = useState(() => Date.now())
    const [chickenFrame, setChickenFrame] = useState<ChickenFrameState>({
        visible: false,
        x: -9999,
        y: -9999,
        angleDeg: 0,
        pecking: false
    })
    const [peckImpact, setPeckImpact] = useState<PeckImpactState | null>(null)
    const [eggState, setEggState] = useState<EggState | null>(null)
    const [eggsCollected, setEggsCollected] = useState(0)

    const frozenRemainingMs = Math.max(0, freezeUntilRef.current - clockNow)
    const screenFrozen = frozenRemainingMs > 0
    frozenRef.current = screenFrozen

    const setEggProgress = (nextValue: number) => {
        eggsCollectedRef.current = nextValue
        setEggsCollected(nextValue)
    }

    const clearEgg = () => {
        eggRef.current = null
        setEggState(null)
    }

    const spawnEgg = () => {
        if (!chickenRef.current.active) {
            clearEgg()
            return
        }

        const viewportWidth = window.innerWidth || 1024
        const viewportHeight = window.innerHeight || 768
        const minX = EGG_SPAWN_MARGIN_PX
        const maxX = Math.max(minX + 1, viewportWidth - EGG_SPAWN_MARGIN_PX)
        const minY = Math.max(EGG_SPAWN_MARGIN_PX, 84) // evita tapar topbar
        const maxY = Math.max(minY + 1, viewportHeight - EGG_SPAWN_MARGIN_PX)
        const now = Date.now()
        const nextEgg: EggState = {
            id: ++eggSeqRef.current,
            x: Math.round(minX + Math.random() * Math.max(1, maxX - minX)),
            y: Math.round(minY + Math.random() * Math.max(1, maxY - minY)),
            spawnedAt: now,
            expiresAt: now + EGG_LIFETIME_MS
        }
        eggRef.current = nextEgg
        setEggState(nextEgg)
    }

    const handleMissedEgg = () => {
        if (!chickenRef.current.active) return
        if (eggsCollectedRef.current !== 0) {
            setEggProgress(0)
        }
        spawnEgg()
    }

    const stopChicken = () => {
        const chicken = chickenRef.current
        chicken.active = false
        chicken.peckUntil = 0
        chicken.vx = 0
        chicken.vy = 0
        clearEgg()
        setChickenFrame((prev) => ({ ...prev, visible: false, pecking: false }))

        if (rafRef.current != null) {
            window.cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        lastFrameTsRef.current = null
    }

    useEffect(() => {
        const interval = window.setInterval(() => {
            setClockNow(Date.now())
        }, 250)
        return () => window.clearInterval(interval)
    }, [])

    useEffect(() => {
        const onPointerMove = (event: PointerEvent) => {
            cursorRef.current = { x: event.clientX, y: event.clientY }
        }

        const blockIfFrozen = (event: Event) => {
            if (!frozenRef.current) return false
            event.preventDefault()
            event.stopPropagation()
            ;(event as any).stopImmediatePropagation?.()
            return true
        }

        const spawnChickenForButtonClick = (event: MouseEvent) => {
            if (blockIfFrozen(event)) return
            const buttonLike = isButtonLikeTarget(event.target)
            if (!buttonLike) return

            if (Math.random() > CHICKEN_SPAWN_PROBABILITY) return
            if (chickenRef.current.active) return

            const viewportWidth = window.innerWidth || 1024
            const viewportHeight = window.innerHeight || 768
            const spawn = getRandomEdgeSpawnPoint(viewportWidth, viewportHeight)
            const targetX = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : cursorRef.current.x
            const targetY = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : cursorRef.current.y

            cursorRef.current = {
                x: Number.isFinite(targetX) ? targetX : viewportWidth * 0.5,
                y: Number.isFinite(targetY) ? targetY : viewportHeight * 0.5
            }

            chickenRef.current = {
                active: true,
                x: spawn.x,
                y: spawn.y,
                vx: 0,
                vy: 0,
                angleDeg: 0,
                lastPeckAt: 0,
                peckUntil: 0
            }
            setEggProgress(0)
            setChickenFrame({
                visible: true,
                x: spawn.x,
                y: spawn.y,
                angleDeg: 0,
                pecking: false
            })
            spawnEgg()

            if (rafRef.current == null) {
                lastFrameTsRef.current = null
                rafRef.current = window.requestAnimationFrame(tick)
            }
        }

        const onPointerDownCapture = (event: PointerEvent) => {
            blockIfFrozen(event)
        }
        const onWheelCapture = (event: WheelEvent) => {
            blockIfFrozen(event)
        }
        const onTouchMoveCapture = (event: TouchEvent) => {
            blockIfFrozen(event)
        }
        const onKeyDownCapture = (event: KeyboardEvent) => {
            if (!frozenRef.current) return
            event.preventDefault()
            event.stopPropagation()
            ;(event as any).stopImmediatePropagation?.()
        }

        document.addEventListener('pointermove', onPointerMove, { passive: true })
        document.addEventListener('pointerdown', onPointerDownCapture, true)
        document.addEventListener('wheel', onWheelCapture, { passive: false, capture: true })
        document.addEventListener('touchmove', onTouchMoveCapture, { passive: false, capture: true })
        document.addEventListener('keydown', onKeyDownCapture, true)
        document.addEventListener('click', spawnChickenForButtonClick, true)

        return () => {
            document.removeEventListener('pointermove', onPointerMove)
            document.removeEventListener('pointerdown', onPointerDownCapture, true)
            document.removeEventListener('wheel', onWheelCapture, true)
            document.removeEventListener('touchmove', onTouchMoveCapture, true)
            document.removeEventListener('keydown', onKeyDownCapture, true)
            document.removeEventListener('click', spawnChickenForButtonClick, true)
        }
    }, [])

    const tick = (timestamp: number) => {
        const chicken = chickenRef.current
        if (!chicken.active) {
            rafRef.current = null
            lastFrameTsRef.current = null
            return
        }

        const nowEpoch = Date.now()
        const egg = eggRef.current
        if (!egg || nowEpoch >= egg.expiresAt) {
            handleMissedEgg()
        }

        const previousTs = lastFrameTsRef.current ?? timestamp
        const dtSeconds = Math.min(0.05, Math.max(0.001, (timestamp - previousTs) / 1000))
        lastFrameTsRef.current = timestamp

        const target = cursorRef.current
        const dx = target.x - chicken.x
        const dy = target.y - chicken.y
        const distance = Math.hypot(dx, dy) || 0.0001

        const ax = (dx / distance) * CHICKEN_ACCELERATION_PX_PER_SEC2
        const ay = (dy / distance) * CHICKEN_ACCELERATION_PX_PER_SEC2

        chicken.vx += ax * dtSeconds
        chicken.vy += ay * dtSeconds

        chicken.vx *= CHICKEN_FRICTION
        chicken.vy *= CHICKEN_FRICTION

        const currentSpeed = Math.hypot(chicken.vx, chicken.vy)
        if (currentSpeed > CHICKEN_MAX_SPEED_PX_PER_SEC) {
            const ratio = CHICKEN_MAX_SPEED_PX_PER_SEC / currentSpeed
            chicken.vx *= ratio
            chicken.vy *= ratio
        }

        chicken.x += chicken.vx * dtSeconds
        chicken.y += chicken.vy * dtSeconds

        const viewportWidth = window.innerWidth || 1024
        const viewportHeight = window.innerHeight || 768
        chicken.x = clamp(chicken.x, -80, viewportWidth + 80)
        chicken.y = clamp(chicken.y, -80, viewportHeight + 80)

        const velocityAngle = Math.atan2(chicken.vy, chicken.vx) * (180 / Math.PI)
        chicken.angleDeg = clamp(velocityAngle * 0.35, -22, 22)

        const updatedDistance = Math.hypot(target.x - chicken.x, target.y - chicken.y)
        if (updatedDistance <= PECK_DISTANCE_PX && timestamp - chicken.lastPeckAt >= PECK_COOLDOWN_MS) {
            chicken.lastPeckAt = timestamp
            chicken.peckUntil = timestamp + PECK_ANIMATION_MS
            setEggProgress(0)

            if (freezeUntilRef.current < Date.now() + BUTTON_FREEZE_MS) {
                freezeUntilRef.current = Date.now() + BUTTON_FREEZE_MS
                setClockNow(Date.now())
            }

            setPeckImpact({
                x: target.x,
                y: target.y,
                expiresAt: Date.now() + 320
            })
        }

        const activeEgg = eggRef.current
        if (activeEgg) {
            const eggDistance = Math.hypot(activeEgg.x - chicken.x, activeEgg.y - chicken.y)
            if (eggDistance <= EGG_HIT_DISTANCE_PX) {
                const nextProgress = eggsCollectedRef.current + 1
                setEggProgress(nextProgress)
                if (nextProgress >= EGG_TARGET_COUNT) {
                    stopChicken()
                    return
                }
                spawnEgg()
            }
        }

        setChickenFrame({
            visible: true,
            x: chicken.x,
            y: chicken.y,
            angleDeg: chicken.angleDeg,
            pecking: timestamp < chicken.peckUntil
        })

        rafRef.current = window.requestAnimationFrame(tick)
    }

    useEffect(() => {
        const chicken = chickenRef.current
        if (!chicken.active) return
        const egg = eggRef.current
        if (!egg) {
            handleMissedEgg()
            return
        }
        if (clockNow >= egg.expiresAt) {
            handleMissedEgg()
        }
    }, [clockNow])

    useEffect(() => {
        if (!peckImpact) return
        if (clockNow >= peckImpact.expiresAt) {
            setPeckImpact(null)
        }
    }, [clockNow, peckImpact])

    useEffect(() => {
        return () => {
            if (rafRef.current != null) {
                window.cancelAnimationFrame(rafRef.current)
            }
        }
    }, [])

    const freezeLabel = useMemo(
        () => (screenFrozen ? formatMsAsMinSec(frozenRemainingMs) : null),
        [screenFrozen, frozenRemainingMs]
    )
    const eggLifetimeProgress = eggState
        ? Math.min(1, Math.max(0, (clockNow - eggState.spawnedAt) / EGG_LIFETIME_MS))
        : 0
    const eggVisualOpacity = eggState ? Math.max(0.12, 1 - eggLifetimeProgress * 0.88) : 0
    const eggAuraOpacity = eggState ? Math.max(0.08, 1 - eggLifetimeProgress * 0.95) : 0
    const eggVisualScale = eggState ? Math.max(0.9, 1 - eggLifetimeProgress * 0.12) : 1

    return (
        <>
            {(chickenFrame.visible || screenFrozen) && (
                <div
                    className='fixed inset-0'
                    style={{ zIndex: 260, pointerEvents: screenFrozen ? 'auto' : 'none' }}
                    onPointerDownCapture={screenFrozen ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
                    onClickCapture={screenFrozen ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
                    onWheelCapture={screenFrozen ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
                    onTouchMoveCapture={screenFrozen ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
                    onMouseDownCapture={screenFrozen ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
                    onContextMenu={screenFrozen ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
                    onDragStart={screenFrozen ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
                    role={screenFrozen ? 'presentation' : undefined}
                    aria-hidden='true'
                >
                    {screenFrozen && (
                        <div
                            className='absolute inset-0'
                            style={{
                                background: 'rgba(2, 6, 23, 0.28)',
                                backdropFilter: 'blur(4px) saturate(0.9)',
                                pointerEvents: 'auto'
                            }}
                        />
                    )}

                    {chickenFrame.visible && (
                        <>
                            {eggState && (
                                <div
                                    className='absolute -translate-x-1/2 -translate-y-1/2 select-none'
                                    style={{
                                        left: eggState.x,
                                        top: eggState.y,
                                        pointerEvents: 'none',
                                        opacity: eggVisualOpacity,
                                        transform: `translate(-50%, -50%) scale(${eggVisualScale})`,
                                        transition: 'opacity 120ms linear, transform 120ms linear',
                                        filter: `saturate(${0.9 + (1 - eggLifetimeProgress) * 0.25})`
                                    }}
                                >
                                    <div
                                        className='relative flex items-center justify-center rounded-full'
                                        style={{
                                            width: 54,
                                            height: 54,
                                            background: `conic-gradient(rgba(59,130,246,${0.35 + eggAuraOpacity * 0.6}) ${(1 - eggLifetimeProgress) * 360}deg, rgba(148,163,184,0.10) 0deg)`,
                                            animation: 'ah-chicken-egg-float 700ms ease-in-out infinite',
                                            boxShadow: `0 10px 28px rgba(2,6,23,${0.08 + eggAuraOpacity * 0.16})`
                                        }}
                                    >
                                        <div
                                            className='absolute inset-[4px] rounded-full'
                                            style={{
                                                background: `rgba(255,255,255,${0.45 + eggVisualOpacity * 0.5})`,
                                                border: `1px solid rgba(148,163,184,${0.08 + eggAuraOpacity * 0.22})`
                                            }}
                                        />
                                        <div
                                            className='relative flex items-center justify-center rounded-full'
                                            style={{
                                                width: 34,
                                                height: 40,
                                                background: 'radial-gradient(circle at 35% 28%, #fffdf6 0%, #fff7dc 48%, #fde68a 100%)',
                                                border: '2px solid rgba(180, 83, 9, 0.24)',
                                                borderRadius: '50% 50% 46% 46% / 56% 56% 44% 44%',
                                                transform: `scale(${1 - eggLifetimeProgress * 0.08})`,
                                                opacity: Math.max(0.22, 1 - eggLifetimeProgress * 0.8)
                                            }}
                                        >
                                            <div
                                                className='absolute'
                                                style={{
                                                    top: 6,
                                                    left: 8,
                                                    width: 8,
                                                    height: 10,
                                                    borderRadius: '999px',
                                                    background: `rgba(255,255,255,${0.16 + eggVisualOpacity * 0.5})`,
                                                    filter: 'blur(1px)'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div
                                className='absolute -translate-x-1/2 -translate-y-1/2 select-none'
                                style={{
                                    left: chickenFrame.x,
                                    top: chickenFrame.y,
                                    pointerEvents: 'none',
                                    transform: `translate(-50%, -50%) ${chickenFrame.pecking ? `translateX(${chickenFrame.angleDeg < 0 ? -16 : 16}px) translateY(4px)` : ''} rotate(${chickenFrame.angleDeg}deg) scale(${chickenFrame.pecking ? 1.22 : 1})`,
                                    transition: chickenFrame.pecking ? 'transform 35ms ease-out' : undefined
                                }}
                            >
                                <div
                                    className='relative flex items-center justify-center'
                                    style={{
                                        boxShadow: chickenFrame.pecking
                                            ? '0 0 0 18px rgba(251,191,36,0.18)'
                                            : '0 14px 28px rgba(0,0,0,0.28)'
                                    }}
                                >
                                    <ChickenFullBodyArt
                                        facingLeft={chickenFrame.angleDeg < 0}
                                        pecking={chickenFrame.pecking}
                                    />
                                    {chickenFrame.pecking && (
                                        <div
                                            className='absolute'
                                            style={{
                                                right: chickenFrame.angleDeg < 0 ? 'auto' : -14,
                                                left: chickenFrame.angleDeg < 0 ? -14 : 'auto',
                                                top: 12,
                                                width: 38,
                                                height: 28,
                                                borderRadius: '999px',
                                                background: 'radial-gradient(circle at 40% 50%, rgba(254,202,202,0.9) 0%, rgba(239,68,68,0.95) 45%, rgba(153,27,27,0.9) 100%)',
                                                filter: 'blur(1.4px)',
                                                opacity: 0.92,
                                                animation: 'ah-chicken-beak-splat 120ms ease-out infinite'
                                            }}
                                        >
                                            <div
                                                className='absolute rounded-full'
                                                style={{
                                                    width: 9,
                                                    height: 9,
                                                    background: 'rgba(239,68,68,0.9)',
                                                    top: -4,
                                                    left: chickenFrame.angleDeg < 0 ? 26 : 2,
                                                    animation: 'ah-chicken-blood-drop 110ms ease-out infinite'
                                                }}
                                            />
                                            <div
                                                className='absolute rounded-full'
                                                style={{
                                                    width: 7,
                                                    height: 7,
                                                    background: 'rgba(127,29,29,0.88)',
                                                    bottom: -2,
                                                    left: chickenFrame.angleDeg < 0 ? 21 : 8,
                                                    animation: 'ah-chicken-blood-drop 130ms ease-out infinite -45ms'
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div
                                className='absolute rounded-2xl border px-3 py-2 shadow-lg'
                                style={{
                                    left: 16,
                                    bottom: 16,
                                    background: 'rgba(9, 14, 31, 0.86)',
                                    borderColor: 'rgba(251, 191, 36, 0.28)',
                                    color: '#f8fafc',
                                    backdropFilter: 'blur(8px)'
                                }}
                            >
                                <div className='text-[10px] uppercase tracking-[0.18em] font-black text-amber-300'>Gallina activa</div>
                                <div className='text-sm font-black'>Huevos atravesados: {eggsCollected}/{EGG_TARGET_COUNT}</div>
                                <div className='mt-1 h-2 w-52 rounded-full bg-white/10 overflow-hidden border border-white/10'>
                                    <div
                                        className='h-full rounded-full transition-all duration-150'
                                        style={{
                                            width: `${(eggsCollected / EGG_TARGET_COUNT) * 100}%`,
                                            background: 'linear-gradient(90deg, #60a5fa 0%, #22d3ee 55%, #34d399 100%)'
                                        }}
                                    />
                                </div>
                                <div className='text-[11px] text-white/70 mt-1'>
                                    Guíala por {EGG_TARGET_COUNT} huevos antes de que te pique. Cada huevo dura 4s.
                                </div>
                            </div>
                        </>
                    )}

                    {screenFrozen && (
                        <div
                            className='absolute right-4 top-[82px] rounded-2xl border px-4 py-3 shadow-2xl'
                            style={{
                                background: 'rgba(127, 29, 29, 0.9)',
                                borderColor: 'rgba(252, 165, 165, 0.35)',
                                color: '#fff1f2',
                                maxWidth: 360,
                                pointerEvents: 'none'
                            }}
                        >
                            <div className='text-[10px] uppercase tracking-[0.18em] font-black text-rose-200'>Picotazo detectado</div>
                            <div className='text-sm font-black'>Pantalla congelada: {freezeLabel}</div>
                            <div className='text-[11px] text-rose-100/80'>La gallina alcanzó el cursor. Interacciones bloqueadas por 1 minuto.</div>
                        </div>
                    )}

                    {peckImpact && clockNow < peckImpact.expiresAt && (
                        <div
                            className='absolute -translate-x-1/2 -translate-y-1/2'
                            style={{
                                left: peckImpact.x,
                                top: peckImpact.y,
                                width: 54,
                                height: 54,
                                pointerEvents: 'none',
                                animation: 'ah-chicken-peck-burst 300ms ease-out forwards'
                            }}
                        >
                            <div
                                className='absolute inset-0 rounded-full'
                                style={{
                                    background: 'radial-gradient(circle, rgba(239,68,68,0.9) 0%, rgba(220,38,38,0.75) 35%, rgba(127,29,29,0.55) 60%, rgba(127,29,29,0) 76%)',
                                    filter: 'blur(0.6px)'
                                }}
                            />
                            <div
                                className='absolute rounded-full'
                                style={{
                                    left: 4,
                                    top: 14,
                                    width: 14,
                                    height: 10,
                                    background: 'rgba(153,27,27,0.85)',
                                    transform: 'rotate(-26deg)',
                                    animation: 'ah-chicken-blood-drop 240ms ease-out forwards'
                                }}
                            />
                            <div
                                className='absolute rounded-full'
                                style={{
                                    right: 6,
                                    top: 10,
                                    width: 12,
                                    height: 9,
                                    background: 'rgba(239,68,68,0.86)',
                                    transform: 'rotate(22deg)',
                                    animation: 'ah-chicken-blood-drop 220ms ease-out forwards -30ms'
                                }}
                            />
                            <div
                                className='absolute rounded-full'
                                style={{
                                    left: 22,
                                    bottom: 4,
                                    width: 10,
                                    height: 8,
                                    background: 'rgba(127,29,29,0.85)',
                                    transform: 'rotate(14deg)',
                                    animation: 'ah-chicken-blood-drop 260ms ease-out forwards -20ms'
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            <style jsx global>{`
                @keyframes ah-chicken-peck-pulse {
                    0% {
                        transform: translate(-50%, -50%) scale(0.45);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(1.15);
                        opacity: 0;
                    }
                }

                @keyframes ah-chicken-peck-burst {
                    0% {
                        transform: translate(-50%, -50%) scale(0.35) rotate(-10deg);
                        opacity: 0.98;
                    }
                    60% {
                        transform: translate(-50%, -50%) scale(1.18) rotate(8deg);
                        opacity: 0.96;
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(1.35) rotate(12deg);
                        opacity: 0;
                    }
                }

                @keyframes ah-chicken-beak-splat {
                    0% {
                        transform: scale(0.6) translateX(0px) translateY(0px);
                        opacity: 0.08;
                    }
                    45% {
                        transform: scale(1.2) translateX(5px) translateY(-1px);
                        opacity: 0.98;
                    }
                    100% {
                        transform: scale(0.82) translateX(1px) translateY(1px);
                        opacity: 0.08;
                    }
                }

                @keyframes ah-chicken-blood-drop {
                    0% {
                        transform: translate(0px, 0px) scale(0.5);
                        opacity: 0.95;
                    }
                    100% {
                        transform: translate(8px, 10px) scale(1.25);
                        opacity: 0;
                    }
                }

                @keyframes ah-chicken-wing-flap {
                    0% {
                        transform: rotate(-22deg) translateY(1px) scaleY(1.02);
                    }
                    100% {
                        transform: rotate(22deg) translateY(-2px) scaleY(0.86);
                    }
                }

                @keyframes ah-chicken-wing-flap-aggressive {
                    0% {
                        transform: rotate(-36deg) translateY(2px) scaleY(1.08) skewX(-3deg);
                        opacity: 0.95;
                    }
                    35% {
                        transform: rotate(6deg) translateY(-1px) scaleY(0.94) skewX(1deg);
                        opacity: 0.88;
                    }
                    100% {
                        transform: rotate(34deg) translateY(-4px) scaleY(0.72) skewX(4deg);
                        opacity: 0.78;
                    }
                }

                @keyframes ah-chicken-body-bob {
                    0%,
                    100% {
                        transform: translateY(0px) rotate(0deg);
                    }
                    50% {
                        transform: translateY(3.2px) rotate(-1.4deg);
                    }
                }

                @keyframes ah-chicken-head-bob {
                    0%,
                    100% {
                        transform: translate(0px, 0px) rotate(0deg);
                    }
                    50% {
                        transform: translate(1px, 1.4px) rotate(4deg);
                    }
                }

                @keyframes ah-chicken-head-peck {
                    0% {
                        transform: translate(0px, 0px) rotate(0deg) scale(1);
                    }
                    14% {
                        transform: translate(7px, 2px) rotate(11deg) scale(1.03);
                    }
                    28% {
                        transform: translate(16px, 6px) rotate(22deg) scale(1.08);
                    }
                    42% {
                        transform: translate(8px, 2px) rotate(10deg) scale(1.03);
                    }
                    60% {
                        transform: translate(17px, 6px) rotate(24deg) scale(1.09);
                    }
                    76% {
                        transform: translate(9px, 3px) rotate(12deg) scale(1.03);
                    }
                    100% {
                        transform: translate(0px, 0px) rotate(-5deg) scale(1);
                    }
                }

                @keyframes ah-chicken-leg-run {
                    0% {
                        transform: rotate(-19deg) translateY(-1px);
                    }
                    100% {
                        transform: rotate(21deg) translateY(2px);
                    }
                }

                @keyframes ah-chicken-tail-wag {
                    0% {
                        transform: rotate(-10deg) translateX(0px);
                    }
                    100% {
                        transform: rotate(11deg) translateX(-1px);
                    }
                }

                @keyframes ah-chicken-egg-float {
                    0%,
                    100% {
                        transform: translateY(0px) scale(1);
                        filter: drop-shadow(0 0 0 rgba(96, 165, 250, 0));
                    }
                    50% {
                        transform: translateY(-2px) scale(1.03);
                        filter: drop-shadow(0 0 8px rgba(96, 165, 250, 0.22));
                    }
                }
            `}</style>
        </>
    )
}
