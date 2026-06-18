import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Bell, BellOff } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function NotificationPermission() {
    const [permission, setPermission] = useState(Notification.permission);
    const [loading, setLoading] = useState(false);

    const subscribeUser = async () => {
        if (!('Notification' in window)) {
            alert('Este navegador no soporta notificaciones push');
            return;
        }

        try {
            setLoading(true);
            const perm = await Notification.requestPermission();
            setPermission(perm);

            if (perm === 'granted') {
                // Registrar Service Worker
                const registration = await navigator.serviceWorker.ready;
                const subscribeOptions = {
                    userVisibleOnly: true,
                    applicationServerKey: process.env.VAPID_PUBLIC_KEY || 'B...' // Tu clave pública VAPID
                };

                const subscription = await registration.pushManager.subscribe(subscribeOptions);

                // Enviar suscripción al backend
                await axios.post(
                    `${API_URL}/notifications/subscribe`,
                    { subscription },
                    { headers: getAuthHeader() }
                );

                alert('✅ Notificaciones activadas');
            } else {
                alert('❌ Permiso denegado para notificaciones');
            }
        } catch (err) {
            console.error(err);
            alert('Error al activar notificaciones');
        } finally {
            setLoading(false);
        }
    };

    if (permission === 'granted') {
        return (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Bell size={18} />
                <span className="text-sm">Notificaciones activas</span>
            </div>
        );
    }

    return (
        <button
            onClick={subscribeUser}
            disabled={loading}
            className="flex items-center gap-2 text-sm bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors"
        >
            {loading ? (
                <span className="animate-pulse">Activando...</span>
            ) : (
                <>
                    <BellOff size={18} />
                    <span>Activar notificaciones</span>
                </>
            )}
        </button>
    );
}