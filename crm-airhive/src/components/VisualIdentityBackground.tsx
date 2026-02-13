'use client'

import React from 'react'

/**
 * VisualIdentityBackground
 * 
 * Integrated as a global background layer.
 * Features bold "Blue Twisted Tube" designs on the margins, 
 * directly inspired by Air Hive's presentation aesthetics.
 */
export default function VisualIdentityBackground() {
    return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
            {/* Left Side Bold Twisted Tube */}
            <div className="absolute left-[-10%] top-0 h-full w-[40%] opacity-[0.45] dark:opacity-[0.15] transition-opacity duration-700">
                <svg
                    viewBox="0 0 600 1200"
                    className="h-full w-full"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="none"
                >
                    {/* Extremely Thick Background Tube */}
                    <path
                        d="M-100 0C100 200 300 400 250 600C200 800 -100 1000 50 1200H-200V0H-100Z"
                        fill="var(--accent-primary, #2048FF)"
                    />
                    {/* Layered Twisted Element 1 */}
                    <path
                        d="M50 0C150 250 350 450 300 650C250 850 50 1050 150 1300"
                        stroke="var(--accent-secondary, #2048FF)"
                        strokeWidth="120"
                        strokeLinecap="round"
                        className="opacity-70"
                    />
                    {/* Layered Twisted Element 2 */}
                    <path
                        d="M-50 100C100 350 250 550 200 750C150 950 -50 1150 50 1400"
                        stroke="var(--accent-primary, #2048FF)"
                        strokeWidth="60"
                        strokeLinecap="round"
                        className="opacity-40"
                    />
                    {/* Bright Accent Highlight */}
                    <path
                        d="M100 0C250 300 450 500 400 700C350 900 100 1100 200 1350"
                        stroke="white"
                        strokeWidth="10"
                        strokeLinecap="round"
                        className="opacity-10 mix-blend-overlay"
                    />
                </svg>
            </div>

            {/* Right Side Bold Twisted Tube */}
            <div className="absolute right-[-10%] bottom-0 h-full w-[40%] opacity-[0.45] dark:opacity-[0.15] transition-opacity duration-700">
                <svg
                    viewBox="0 0 600 1200"
                    className="h-full w-full rotate-180"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="none"
                >
                    {/* Extremely Thick Background Tube */}
                    <path
                        d="M-100 0C100 200 300 400 250 600C200 800 -100 1000 50 1200H-200V0H-100Z"
                        fill="var(--accent-primary, #2048FF)"
                    />
                    {/* Layered Twisted Element 1 */}
                    <path
                        d="M50 0C150 250 350 450 300 650C250 850 50 1050 150 1300"
                        stroke="var(--accent-secondary, #2048FF)"
                        strokeWidth="120"
                        strokeLinecap="round"
                        className="opacity-70"
                    />
                    {/* Layered Twisted Element 2 */}
                    <path
                        d="M-50 100C100 350 250 550 200 750C150 950 -50 1150 50 1400"
                        stroke="var(--accent-primary, #2048FF)"
                        strokeWidth="60"
                        strokeLinecap="round"
                        className="opacity-40"
                    />
                </svg>
            </div>
        </div>
    )
}
