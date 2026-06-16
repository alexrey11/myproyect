import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Store } from 'lucide-react';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await login(username, password);
            navigate('/');
        } catch (err) {
            setError('Usuario o contraseña incorrectos');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200/60">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <Store className="text-blue-700" size={48} />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-800">Tecopos Plus</h1>
                    <p className="text-slate-500 mt-2">Inicia sesión para continuar</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input-field pl-10" placeholder="admin" required />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-10" placeholder="••••••••" required />
                        </div>
                    </div>
                    {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-lg">{error}</div>}
                    <button type="submit" className="btn-primary w-full">Ingresar</button>
                </form>
                <div className="mt-4 text-sm text-center text-slate-500">
                    Admin: admin / admin123
                </div>
            </div>
        </div>
    );
}