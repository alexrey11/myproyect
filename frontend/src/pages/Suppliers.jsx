import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Plus, Edit, Trash2, Search } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Suppliers() {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: '', contact: '', phone: '', email: '', address: '' });

    const fetchSuppliers = async () => {
        try {
            const res = await axios.get(`${API_URL}/suppliers`, { headers: getAuthHeader() });
            setSuppliers(res.data);
        } catch (err) {
            console.error(err);
            alert('Error al cargar proveedores');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSuppliers(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await axios.put(`${API_URL}/suppliers/${editingId}`, formData, { headers: getAuthHeader() });
            } else {
                await axios.post(`${API_URL}/suppliers`, formData, { headers: getAuthHeader() });
            }
            setShowModal(false);
            setEditingId(null);
            setFormData({ name: '', contact: '', phone: '', email: '', address: '' });
            fetchSuppliers();
        } catch (err) {
            alert('Error al guardar');
            console.error(err);
        }
    };

    const handleEdit = (supplier) => {
        setEditingId(supplier.id);
        setFormData({
            name: supplier.name,
            contact: supplier.contact || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            address: supplier.address || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar este proveedor?')) return;
        try {
            await axios.delete(`${API_URL}/suppliers/${id}`, { headers: getAuthHeader() });
            fetchSuppliers();
        } catch (err) {
            alert('Error al eliminar');
        }
    };

    const filtered = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.contact && s.contact.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.phone && s.phone.includes(searchTerm))
    );

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Users size={24} /> Proveedores</h2>
                <button onClick={() => { setEditingId(null); setFormData({ name: '', contact: '', phone: '', email: '', address: '' }); setShowModal(true); }} className="btn-primary w-full sm:w-auto text-sm sm:text-base"><Plus size={18} /> Nuevo</button>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar proveedor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field pl-10" />
            </div>

            {/* VISTA ESCRITORIO - TABLA */}
            <div className="hidden md:block card overflow-hidden dark:bg-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Contacto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Teléfono</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Email</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                        {filtered.map(s => (
                            <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">{s.name}</td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{s.contact || '-'}</td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{s.phone || '-'}</td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{s.email || '-'}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => handleEdit(s)} className="text-blue-600 hover:text-blue-800 mr-3 transition-colors"><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700 transition-colors"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan="5" className="text-center py-8 text-slate-400 dark:text-slate-500">No hay proveedores registrados</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* VISTA MÓVIL - TARJETAS */}
            <div className="md:hidden space-y-4">
                {filtered.map(s => (
                    <div key={s.id} className="card p-4 dark:bg-slate-800">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold text-slate-800 dark:text-white">{s.name}</h3>
                                {s.contact && <p className="text-sm text-slate-500 dark:text-slate-400">👤 {s.contact}</p>}
                                {s.phone && <p className="text-sm text-slate-500 dark:text-slate-400">📞 {s.phone}</p>}
                                {s.email && <p className="text-sm text-slate-500 dark:text-slate-400">📧 {s.email}</p>}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => handleEdit(s)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"><Edit size={16} /></button>
                                <button onClick={() => handleDelete(s.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500">No hay proveedores</div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
                            {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-3">
                                <input type="text" placeholder="Nombre *" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field" required />
                                <input type="text" placeholder="Contacto" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} className="input-field" />
                                <input type="text" placeholder="Teléfono" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="input-field" />
                                <input type="email" placeholder="Email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="input-field" />
                                <input type="text" placeholder="Dirección" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="input-field" />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => { setShowModal(false); setEditingId(null); }} className="btn-outline">Cancelar</button>
                                <button type="submit" className="btn-primary">{editingId ? 'Actualizar' : 'Guardar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}