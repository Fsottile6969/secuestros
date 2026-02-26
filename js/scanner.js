/**
 * scanner.js — Integración con html5-qrcode
 * Maneja la apertura/cierre de la cámara y devuelve el código escaneado.
 */

const Scanner = (() => {
    let html5QrCode = null;
    let onSuccessCallback = null;

    /** Inicia el escáner en el div con id="reader" */
    async function iniciar(onSuccess) {
        onSuccessCallback = onSuccess;

        if (html5QrCode) {
            await detener();
        }

        html5QrCode = new Html5Qrcode('reader');

        const config = {
            fps: 10,
            qrbox: { width: 240, height: 120 },
            aspectRatio: 1.5,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.PDF_417,
                Html5QrcodeSupportedFormats.DATA_MATRIX,
            ],
        };

        try {
            await html5QrCode.start(
                { facingMode: 'environment' }, // cámara trasera
                config,
                (decodedText) => {
                    // Éxito: detener cámara y notificar
                    detener();
                    if (onSuccessCallback) onSuccessCallback(decodedText);
                },
                (_errorMsg) => {
                    // Errores de frame ignorados (no escaneo aún)
                }
            );
            return true;
        } catch (err) {
            console.warn('Scanner error:', err);
            return false;
        }
    }

    /** Detiene la cámara si está activa */
    async function detener() {
        if (html5QrCode) {
            try {
                const state = html5QrCode.getState();
                // state 2 = SCANNING, state 3 = PAUSED
                if (state === 2 || state === 3) {
                    await html5QrCode.stop();
                }
            } catch (e) {
                // ignorar errores al detener
            }
            html5QrCode = null;
        }
    }

    /** Verifica si la cámara está disponible */
    async function verificarCamara() {
        try {
            const devices = await Html5Qrcode.getCameras();
            return devices && devices.length > 0;
        } catch {
            return false;
        }
    }

    return { iniciar, detener, verificarCamara };
})();

window.Scanner = Scanner;
