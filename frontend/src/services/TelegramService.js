import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const TelegramService = {
    // Enviar mensaje al administrador
    async sendMessage(message) {
        try {
            await axios.post(`${API_URL}/telegram/send`, { message }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                }
            });
            console.log('✅ Mensaje enviado a Telegram');
        } catch (err) {
            console.error('Error enviando mensaje a Telegram:', err);
        }
    },

    // Configurar el chat ID del administrador (desde el backend)
    async setChatId(chatId) {
        try {
            await axios.post(`${API_URL}/telegram/set-chat-id`, { chatId }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                }
            });
            console.log('✅ Chat ID configurado');
        } catch (err) {
            console.error('Error configurando Chat ID:', err);
        }
    }
};