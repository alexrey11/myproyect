import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { db } from '../services/Database';
import { Users, Plus, Edit, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Providers() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', contact: '', phone: '', email: '', address: '' });
    const [editingId, setEditingId] = useState(null);
    const { addNotification } = useApp();

    const fetchProviders = async () => {
        try {
            const data = await db.providers.toArray();
            setProviders(data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchProviders(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await db.providers.update(editingId, formData);
                toast.success('Proveedor actualizado');
            } else {
                const id = Date.now();
                await db.providers.add({ ...formData, id, createdAt: new Date().toISOString() });
                toast.success('Proveedor creado');
            }
            setShowModal(false);
            setFormData({ name: '', contact: '', phone: '', email: '', address: '' });
            setEditingId(null);
            fetchProviders();
        } catch (err) {
            console.error(err);
            toast.error('Error al guardar');
        }
    };

    const deleteProvider = async (id) => {
        if (!confirm('¿Eliminar este proveedor?')) return;
        try {
            await db.providers.delete(id);
            fetchProviders();
            toast.success('Proveedor eliminado');
        } catch (err) {
            console.error(err);
            toast.error('Error al eliminar');
        }
    };

    const editProvider = (provider) => {
        setEditingId(provider.id);
        setFormData({
            name: provider.name,
            contact: provider.contact || '',
            phone: provider.phone || '',
            email: provider.email || '',
            address: provider.address || ''
        });
        setShowModal(true);
    };

    const filtered = providers.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.contact && p.contact.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    return (
        <div className="space-y-5">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Users size={24} /> Proveedores</h2>
                <button onClick={() => { setEditingId(null); setFormData({ name: '', contact: '', phone: '', email: '', address: '' }); setShowModal(true); }} className="btn-primary"><Plus size={18} /> Nuevo</button>
            </div>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar proveedor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field pl-10" />
            </div>
            <div className="card overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Contacto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Teléfono</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                        {filtered.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4 font-medium text-slate-800">{p.name}</td>
                                <td className="px-6 py-4 text-slate-600">{p.contact || '-'}</td>
                                <td className="px-6 py-4 text-slate-600">{p.phone || '-'}</td>
                                <td className="px-6 py-4 text-slate-600">{p.email || '-'}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => editProvider(p)} className="text-blue-600 hover:text-blue-800 mr-3"><Edit size={16} /></button>
                                    <button onClick={() => deleteProvider(p.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">{editingId ? 'Editar' : 'Nuevo'} Proveedor</h3>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-3">
                                <input type="text" placeholder="Nombre *" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                                <input type="text" placeholder="Persona de contacto" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                <input type="text" placeholder="Teléfono" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                <input type="email" placeholder="Email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                <input type="text" placeholder="Dirección" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-outline">Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}