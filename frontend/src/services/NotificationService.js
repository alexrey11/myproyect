import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const NotificationService = {
    // ========== SUSCRIBIRSE A NOTIFICACIONES PUSH ==========
    async subscribeToPushNotifications() {
        // Verificar si el navegador soporta notificaciones
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('⚠️ Notificaciones no soportadas en este navegador.');
            return;
        }

        // Si estamos offline, no intentar registrar
        if (!navigator.onLine) {
            console.warn('⏳ Modo offline. La suscripción se realizará cuando vuelva la red.');
            return;
        }

        try {
            // Solicitar permiso
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('Permiso de notificaciones denegado.');
                return;
            }

            // Registrar Service Worker (si no está registrado)
            const registration = await navigator.serviceWorker.ready;

            // Obtener la clave VAPID pública desde variables de entorno
            const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!vapidPublicKey) {
                console.warn('⚠️ Clave VAPID pública no configurada. Las notificaciones push no funcionarán.');
                return;
            }

            // Crear suscripción
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidPublicKey,
            });

            // Enviar suscripción al backend
            const token = localStorage.getItem('token');
            if (!token) {
                console.warn('⚠️ No hay token de autenticación. No se puede registrar la suscripción.');
                return;
            }

            await axios.post(
                `${API_URL}/notifications/subscribe`,
                { subscription },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log('✅ Suscripción a notificaciones push registrada exitosamente.');
        } catch (error) {
            console.error('❌ Error al registrar suscripción de notificaciones:', error);
        }
    },

    // ========== ENVIAR NOTIFICACIÓN DE PRUEBA ==========
    async sendTestNotification(message = '¡Prueba de notificación!') {
        // Verificar conexión
        if (!navigator.onLine) {
            console.warn('⚠️ Sin conexión a internet. No se puede enviar la notificación.');
            throw new Error('No hay conexión a internet');
        }

        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No autenticado');
        }

        try {
            const response = await axios.post(
                `${API_URL}/notifications/send`,
                {
                    title: 'Gestión Pro',
                    body: message,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        } catch (error) {
            console.error('❌ Error enviando notificación:', error);
            throw error;
        }
    },

    // ========== VERIFICAR STOCK BAJO Y NOTIFICAR (OPCIONAL) ==========
    async checkLowStockAndNotify() {
        if (!navigator.onLine) {
            console.warn('⚠️ Modo offline: no se puede verificar stock bajo en el servidor.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await axios.get(`${API_URL}/notifications/check-stock`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            console.log('✅ Notificaciones de stock bajo enviadas:', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Error al verificar stock bajo:', error);
            throw error;
        }
    }
};