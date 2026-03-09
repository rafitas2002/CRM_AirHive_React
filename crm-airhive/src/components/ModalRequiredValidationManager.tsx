'use client'

import { useEffect } from 'react'

function getModalFormFromEventTarget(target: EventTarget | null): HTMLFormElement | null {
    if (!(target instanceof Element)) return null
    const form = target.closest('form')
    if (!(form instanceof HTMLFormElement)) return null
    if (!form.closest('.ah-modal-panel')) return null
    return form
}

export default function ModalRequiredValidationManager() {
    useEffect(() => {
        const markAttempted = (form: HTMLFormElement) => {
            form.classList.add('ah-form-attempted')
        }

        const clearAttemptedIfValid = (form: HTMLFormElement) => {
            if (form.checkValidity()) {
                form.classList.remove('ah-form-attempted')
            }
        }

        const onInvalid = (event: Event) => {
            const form = getModalFormFromEventTarget(event.target)
            if (!form) return
            markAttempted(form)
        }

        const onSubmitCapture = (event: Event) => {
            if (!(event.target instanceof HTMLFormElement)) return
            const form = event.target
            if (!form.closest('.ah-modal-panel')) return
            if (!form.checkValidity()) {
                markAttempted(form)
            } else {
                form.classList.remove('ah-form-attempted')
            }
        }

        const onInputLike = (event: Event) => {
            const form = getModalFormFromEventTarget(event.target)
            if (!form || !form.classList.contains('ah-form-attempted')) return
            clearAttemptedIfValid(form)
        }

        const onReset = (event: Event) => {
            if (!(event.target instanceof HTMLFormElement)) return
            const form = event.target
            if (!form.closest('.ah-modal-panel')) return
            form.classList.remove('ah-form-attempted')
        }

        document.addEventListener('invalid', onInvalid, true)
        document.addEventListener('submit', onSubmitCapture, true)
        document.addEventListener('input', onInputLike, true)
        document.addEventListener('change', onInputLike, true)
        document.addEventListener('reset', onReset, true)

        return () => {
            document.removeEventListener('invalid', onInvalid, true)
            document.removeEventListener('submit', onSubmitCapture, true)
            document.removeEventListener('input', onInputLike, true)
            document.removeEventListener('change', onInputLike, true)
            document.removeEventListener('reset', onReset, true)
        }
    }, [])

    return null
}
