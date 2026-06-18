import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X } from 'lucide-react';

const BarcodeScanner = ({ onDetected, onClose }) => {
    const videoRef = useRef(null);
    const [scanning, setScanning] = useState(true);
    const [error, setError] = useState('');
    const [noCamera, setNoCamera] = useState(false);
    const readerRef = useRef(null);

    useEffect(() => {
        let stream = null;
        const reader = new BrowserMultiFormatReader();

        const startScanner = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                reader.decodeFromVideoElement(videoRef.current, (result, err) => {
                    if (result) {
                        const text = result.getText();
                        onDetected(text);
                        setScanning(false);
                        if (stream) {
                            stream.getTracks().forEach(track => track.stop());
                        }
                    }

                });

                readerRef.current = reader;

            } catch (err) {
                console.error('Error cámara:', err);
                if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
                    setNoCamera(true);
                    setError('📷 No se detectó una cámara en tu dispositivo. Conecta una cámara o usa el buscador manual.');
                } else {
                    setError('No se pudo acceder a la cámara. Permite el acceso en la configuración del navegador.');
                }
            }
        };

        startScanner();

        return () => {
            try {
                if (readerRef.current) {
                    // Intentar detener el lector
                    if (typeof readerRef.current.reset === 'function') {
                        readerRef.current.reset();
                    }
                    if (typeof readerRef.current.stop === 'function') {
                        readerRef.current.stop();
                    }
                }
            } catch (e) {
                // Ignorar
            }
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject = null;
            }
        };
    }, [onDetected]);

    if (error) {
        return (
            <div className="p-6 text-center">
                <div className="text-6xl mb-4">📷</div>
                <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                {noCamera && (
                    <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                        <p>Puedes buscar productos manualmente en el campo de búsqueda.</p>
                        <p className="mt-1">O escanea el código de barras con tu teléfono y escríbelo aquí.</p>
                    </div>
                )}
                <button onClick={onClose} className="btn-primary mt-4">
                    Cerrar
                </button>
            </div>
        );
    }

    return (
        <div className="relative">
            <video
                ref={videoRef}
                className="w-full max-w-md mx-auto rounded-lg bg-black"
                style={{ height: '300px', objectFit: 'cover' }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-blue-500 rounded-lg opacity-50"></div>
            </div>
            <button
                onClick={onClose}
                className="absolute top-2 right-2 bg-white dark:bg-slate-700 rounded-full p-1 shadow-md hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            >
                <X size={24} className="text-slate-700 dark:text-slate-200" />
            </button>
            {scanning && (
                <div className="flex items-center justify-center gap-2 mt-2">
                    <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">🔍 Escaneando... Coloca el código de barras frente a la cámara</p>
                </div>
            )}
        </div>
    );
};

export default BarcodeScanner;