import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const NotificationService = {
    // Solicitar permiso y registrar suscripción
    async subscribeToPushNotifications() {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('Notificaciones no soportadas en este navegador');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Permiso de notificaciones denegado');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: process.env.VITE_VAPID_PUBLIC_KEY || 'BDt...',
            });

            await axios.post(`${API_URL}/notifications/subscribe`, { subscription }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                }
            });
            console.log('✅ Suscripción a notificaciones registrada');
        } catch (err) {
            console.error('Error registrando suscripción:', err);
        }
    },

    // Enviar notificación de prueba
    async sendTestNotification(message = '¡Prueba de notificación!') {
        try {
            await axios.post(`${API_URL}/notifications/send`, {
                title: 'Gestión Pro',
                body: message,
                targetUserId: null // Envía al usuario actual
            }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                }
            });
            console.log('✅ Notificación enviada');
        } catch (err) {
            console.error('Error enviando notificación:', err);
        }
    }
};