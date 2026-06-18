import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Plus, Edit, Trash2, Search, Save, X, Shield, User, Check, X as XIcon } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'vendedor',
        active: true,
        permissions: {
            products: false,
            customers: false,
            sales: false,
            reports: false,
            users: false,
            suppliers: false,
            purchases: false,
            currencies: false,
            backup: false
        }
    });

    const fetchUsers = async () => {
        try {
            const res = await axios.get(`${API_URL}/users`, { headers: getAuthHeader() });
            setUsers(res.data);
        } catch (err) {
            console.error(err);
            alert('Error al cargar usuarios');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await axios.put(`${API_URL}/users/${editingUser}`, formData, { headers: getAuthHeader() });
            } else {
                await axios.post(`${API_URL}/users`, formData, { headers: getAuthHeader() });
            }
            setShowModal(false);
            setEditingUser(null);
            setFormData({
                username: '',
                password: '',
                role: 'vendedor',
                active: true,
                permissions: {
                    products: false,
                    customers: false,
                    sales: false,
                    reports: false,
                    users: false,
                    suppliers: false,
                    purchases: false,
                    currencies: false,
                    backup: false
                }
            });
            fetchUsers();
        } catch (err) {
            alert('Error al guardar usuario');
            console.error(err);
        }
    };

    const handleEdit = (user) => {
        setEditingUser(user.id);
        setFormData({
            username: user.username,
            password: '',
            role: user.role || 'vendedor',
            active: user.active === 1,
            permissions: user.permissions ? JSON.parse(user.permissions) : {
                products: false,
                customers: false,
                sales: false,
                reports: false,
                users: false,
                suppliers: false,
                purchases: false,
                currencies: false,
                backup: false
            }
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar este usuario?')) return;
        try {
            await axios.delete(`${API_URL}/users/${id}`, { headers: getAuthHeader() });
            fetchUsers();
        } catch (err) {
            alert('Error al eliminar');
        }
    };

    const togglePermission = (perm) => {
        setFormData(prev => ({
            ...prev,
            permissions: {
                ...prev.permissions,
                [perm]: !prev.permissions[perm]
            }
        }));
    };

    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.role && u.role.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const getRoleBadge = (role) => {
        if (role === 'admin') return <span className="badge-stock badge-stock-high">Admin</span>;
        if (role === 'vendedor') return <span className="badge-stock badge-stock-low">Vendedor</span>;
        return <span className="badge-stock">{role}</span>;
    };

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Users size={24} /> Usuarios
                </h2>
                <button onClick={() => {
                    setEditingUser(null); setFormData({
                        username: '',
                        password: '',
                        role: 'vendedor',
                        active: true,
                        permissions: {
                            products: false,
                            customers: false,
                            sales: false,
                            reports: false,
                            users: false,
                            suppliers: false,
                            purchases: false,
                            currencies: false,
                            backup: false
                        }
                    }); setShowModal(true);
                }} className="btn-primary w-full sm:w-auto text-sm sm:text-base">
                    <Plus size={18} /> Nuevo Usuario
                </button>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar usuario..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field pl-10" />
            </div>

            {/* VISTA ESCRITORIO - TABLA */}
            <div className="hidden md:block card overflow-hidden dark:bg-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Usuario</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Rol</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Último acceso</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                        {filtered.map(u => (
                            <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">{u.username}</td>
                                <td className="px-6 py-4">{getRoleBadge(u.role)}</td>
                                <td className="px-6 py-4">
                                    {u.active ? (
                                        <span className="text-green-600 dark:text-green-400">✅ Activo</span>
                                    ) : (
                                        <span className="text-red-500 dark:text-red-400">❌ Inactivo</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Nunca'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => handleEdit(u)} className="text-blue-600 hover:text-blue-800 mr-3 transition-colors"><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:text-red-700 transition-colors"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* VISTA MÓVIL - TARJETAS */}
            <div className="md:hidden space-y-4">
                {filtered.map(u => (
                    <div key={u.id} className="card p-4 dark:bg-slate-800">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold text-slate-800 dark:text-white">{u.username}</h3>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {getRoleBadge(u.role)}
                                    {u.active ? (
                                        <span className="text-xs text-green-600">Activo</span>
                                    ) : (
                                        <span className="text-xs text-red-500">Inactivo</span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    Último acceso: {u.last_login ? new Date(u.last_login).toLocaleString() : 'Nunca'}
                                </p>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => handleEdit(u)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16} /></button>
                                <button onClick={() => handleDelete(u.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500">No hay usuarios</div>
                )}
            </div>

            {/* MODAL DE CREACIÓN/EDICIÓN */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
                            {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Usuario *</label>
                                    <input type="text" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        {editingUser ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
                                    </label>
                                    <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="input-field" required={!editingUser} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Rol</label>
                                    <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="input-field">
                                        <option value="vendedor">Vendedor</option>
                                        <option value="admin">Administrador</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="active" checked={formData.active} onChange={e => setFormData({ ...formData, active: e.target.checked })} className="w-4 h-4 text-blue-600" />
                                    <label htmlFor="active" className="text-sm text-slate-700 dark:text-slate-300">Usuario activo</label>
                                </div>

                                {formData.role !== 'admin' && (
                                    <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-2">
                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Permisos específicos</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {Object.entries(formData.permissions).map(([key, value]) => (
                                                <label key={key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                                    <input type="checkbox" checked={value} onChange={() => togglePermission(key)} className="w-3 h-3" />
                                                    {key.charAt(0).toUpperCase() + key.slice(1)}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => { setShowModal(false); setEditingUser(null); }} className="btn-outline">Cancelar</button>
                                <button type="submit" className="btn-primary">{editingUser ? 'Actualizar' : 'Guardar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}