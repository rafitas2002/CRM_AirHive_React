'use client'

import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import getCroppedImg from '@/lib/cropUtils'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface ImageCropperProps {
    imageSrc: string
    onCropComplete: (croppedImage: Blob) => void
    onCancel: () => void
}

const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCropComplete, onCancel }) => {
    useBodyScrollLock(true)
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

    const onCropChange = (crop: any) => {
        setCrop(crop)
    }

    const onZoomChange = (zoom: number) => {
        setZoom(zoom)
    }

    const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }, [])

    const handleConfirm = async () => {
        try {
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels)
            if (croppedImage) {
                onCropComplete(croppedImage)
            }
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="ah-modal-overlay">
            <div className="ah-modal-panel relative w-full max-w-lg md:h-auto md:aspect-square">
                {/* Header */}
                <div className="ah-modal-header">
                    <h3 className="ah-modal-title text-lg">Ajustar Logotipo</h3>
                    <button onClick={onCancel} className="ah-modal-close">✕</button>
                </div>

                {/* Cropper Area */}
                <div className="relative flex-grow bg-gray-900">
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={1 / 1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={onCropChange}
                        onCropComplete={onCropCompleteInternal}
                        onZoomChange={onZoomChange}
                    />
                </div>

                {/* Footer / Controls */}
                <div className="p-6 space-y-6 shrink-0 border-t border-[var(--card-border)] bg-[var(--hover-bg)]">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Zoom</label>
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            aria-labelledby="Zoom"
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1700AC]"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            className="ah-modal-btn ah-modal-btn-secondary flex-1"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="ah-modal-btn ah-modal-btn-primary flex-1"
                        >
                            Aplicar Recorte
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ImageCropper
