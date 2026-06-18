import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

// ========== URL DE LA API ==========
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ========== INTERCEPTOR DE PETICIONES (AÑADE EL TOKEN) ==========
axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ========== INTERCEPTOR DE RESPUESTAS (MANEJA 401) ==========
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        // Si es un error de red (sin conexión), no redirigimos
        if (!navigator.onLine || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
            return Promise.reject(error);
        }
        // Solo redirigir si es 401 y no estamos ya en login
        if (error.response && error.response.status === 401) {
            // Limpiar token
            localStorage.removeItem('token');
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Verificar token al cargar
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                if (decoded.exp * 1000 > Date.now()) {
                    setUser(decoded);
                    // Asegurar que el token esté en el header por defecto
                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                } else {
                    localStorage.removeItem('token');
                }
            } catch (e) {
                localStorage.removeItem('token');
            }
        }
        setLoading(false);
    }, []);

    // ========== LOGIN ==========
    const login = async (username, password) => {
        try {
            const res = await axios.post(`${API_URL}/auth/login`, { username, password });
            const { token, user: userData } = res.data;

            // Guardar token en localStorage
            localStorage.setItem('token', token);
            // Configurar el header por defecto de axios
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(userData);
            return userData;
        } catch (err) {
            console.error('Error en login:', err);
            if (err.response && err.response.status === 401) {
                throw new Error('Usuario o contraseña incorrectos');
            }
            throw new Error('Error de conexión. Verifica que el backend esté corriendo.');
        }
    };

    // ========== LOGOUT ==========
    const logout = () => {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;