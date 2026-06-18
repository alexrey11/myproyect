import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { db } from '../services/Database';
import { syncService } from '../services/SyncService';
import { Users, Plus, Edit, Trash2, Search, History, Save, X, Calendar } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Customers() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });
    const [showPurchasesModal, setShowPurchasesModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [purchases, setPurchases] = useState([]);
    const [editingPurchase, setEditingPurchase] = useState(null);
    const [editForm, setEditForm] = useState({ total: 0, payment_method: 'efectivo', transaction_id: '' });
    const { isOnline } = useApp();
    const { getCurrencySymbol } = useCurrency();

    const fetchCustomers = async () => {
        try {
            const data = await db.customers.toArray();
            setCustomers(data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchCustomers(); }, []);

    // ========== CREAR CLIENTE ==========
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const customerData = { ...formData };
            if (isOnline) {
                const res = await axios.post(`${API_URL}/customers`, customerData, { headers: getAuthHeader() });
                customerData.id = res.data.id;
                await db.customers.add(customerData);
            } else {
                const id = Date.now();
                await db.customers.add({ ...customerData, id });
                await syncService.addToQueue('CREATE_CUSTOMER', 'customers', customerData);
            }
            setShowModal(false);
            setEditingCustomer(null);
            setFormData({ name: '', email: '', phone: '', address: '' });
            fetchCustomers();
        } catch (err) { alert('Error al guardar'); }
    };

    // ========== EDITAR CLIENTE ==========
    const handleEditCustomer = (customer) => {
        setEditingCustomer(customer.id);
        setFormData({
            name: customer.name,
            email: customer.email || '',
            phone: customer.phone || '',
            address: customer.address || ''
        });
        setShowModal(true);
    };

    const handleUpdateCustomer = async (e) => {
        e.preventDefault();
        try {
            const customerData = { ...formData };
            if (isOnline) {
                await axios.put(`${API_URL}/customers/${editingCustomer}`, customerData, { headers: getAuthHeader() });
                await db.customers.update(editingCustomer, customerData);
            } else {
                await db.customers.update(editingCustomer, customerData);
                await syncService.addToQueue('UPDATE_CUSTOMER', 'customers', { id: editingCustomer, ...customerData });
            }
            setShowModal(false);
            setEditingCustomer(null);
            setFormData({ name: '', email: '', phone: '', address: '' });
            fetchCustomers();
        } catch (err) { alert('Error al actualizar'); }
    };

    // ========== ELIMINAR CLIENTE ==========
    const handleDeleteCustomer = async (id) => {
        if (!confirm('¿Eliminar este cliente? Se perderán sus datos.')) return;
        try {
            if (isOnline) {
                await axios.delete(`${API_URL}/customers/${id}`, { headers: getAuthHeader() });
                await db.customers.delete(id);
            } else {
                await db.customers.delete(id);
                await syncService.addToQueue('DELETE_CUSTOMER', 'customers', { id });
            }
            fetchCustomers();
        } catch (err) { alert('Error al eliminar'); }
    };

    // ========== HISTORIAL DE COMPRAS ==========
    const viewPurchases = async (customer) => {
        try {
            if (isOnline) {
                const res = await axios.get(`${API_URL}/customers/${customer.id}/purchases`, { headers: getAuthHeader() });
                setPurchases(res.data);
            } else {
                const localSales = await db.sales.where('customer_id').equals(customer.id).toArray();
                const purchasesWithItems = await Promise.all(localSales.map(async (sale) => {
                    const items = await db.saleItems.where('sale_id').equals(sale.id).toArray();
                    return {
                        id: sale.id,
                        date: sale.date,
                        total: sale.total,
                        currency: sale.currency || 'CUP',
                        payment_method: sale.payment_method || 'efectivo',
                        transaction_id: sale.transaction_id || '',
                        items: items
                    };
                }));
                setPurchases(purchasesWithItems);
            }
            setSelectedCustomer(customer);
            setShowPurchasesModal(true);
        } catch (err) {
            alert('Error al cargar historial');
            console.error(err);
        }
    };

    // ========== EDITAR COMPRA ==========
    const handleEditPurchase = (purchase) => {
        setEditingPurchase(purchase.id);
        setEditForm({
            total: purchase.total || 0,
            payment_method: purchase.payment_method || 'efectivo',
            transaction_id: purchase.transaction_id || ''
        });
    };

    const handleSavePurchaseEdit = async () => {
        try {
            if (isOnline) {
                await axios.put(`${API_URL}/sales/${editingPurchase}`, editForm, { headers: getAuthHeader() });
            } else {
                await db.sales.update(editingPurchase, {
                    total: editForm.total,
                    payment_method: editForm.payment_method,
                    transaction_id: editForm.transaction_id,
                    synced: 0
                });
                await syncService.addToQueue('UPDATE_SALE', 'sales', { id: editingPurchase, ...editForm });
            }
            setEditingPurchase(null);
            // Recargar historial
            if (selectedCustomer) viewPurchases(selectedCustomer);
        } catch (err) {
            alert('Error al actualizar');
            console.error(err);
        }
    };

    // ========== FILTRO Y RENDER ==========
    const filtered = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.phone && c.phone.includes(searchTerm))
    );

    const getPaymentMethodLabel = (method) => {
        const methods = {
            efectivo: '💵 Efectivo',
            transferencia: '🏦 Transferencia',
            transfermovil: '📱 Transfermóvil',
            tarjeta: '💳 Tarjeta',
            otro: '🔄 Otro'
        };
        return methods[method] || method;
    };

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Users size={24} /> Clientes</h2>
                <button onClick={() => { setEditingCustomer(null); setFormData({ name: '', email: '', phone: '', address: '' }); setShowModal(true); }} className="btn-primary w-full sm:w-auto text-sm sm:text-base"><Plus size={18} /> Nuevo</button>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar por nombre, email o teléfono..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field pl-10" />
            </div>

            {/* VISTA ESCRITORIO - TABLA */}
            <div className="hidden md:block card overflow-hidden dark:bg-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Teléfono</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Dirección</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                        {filtered.map(c => (
                            <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">{c.name}</td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{c.email || '-'}</td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{c.phone || '-'}</td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{c.address || '-'}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => viewPurchases(c)} className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 mr-3"><History size={16} /></button>
                                    <button onClick={() => handleEditCustomer(c)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mr-3"><Edit size={16} /></button>
                                    <button onClick={() => handleDeleteCustomer(c.id)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* VISTA MÓVIL - TARJETAS */}
            <div className="md:hidden space-y-4">
                {filtered.map(c => (
                    <div key={c.id} className="card p-4 dark:bg-slate-800">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold text-slate-800 dark:text-white">{c.name}</h3>
                                {c.email && <p className="text-sm text-slate-500 dark:text-slate-400">{c.email}</p>}
                                {c.phone && <p className="text-sm text-slate-500 dark:text-slate-400">📞 {c.phone}</p>}
                                {c.address && <p className="text-sm text-slate-500 dark:text-slate-400">📍 {c.address}</p>}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => viewPurchases(c)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"><History size={16} /></button>
                                <button onClick={() => handleEditCustomer(c)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"><Edit size={16} /></button>
                                <button onClick={() => handleDeleteCustomer(c.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500">No hay clientes</div>
                )}
            </div>

            {/* MODAL DE CREACIÓN/EDICIÓN */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
                            {editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
                        </h3>
                        <form onSubmit={editingCustomer ? handleUpdateCustomer : handleSubmit}>
                            <div className="space-y-3">
                                <input type="text" placeholder="Nombre *" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field" required />
                                <input type="email" placeholder="Email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="input-field" />
                                <input type="text" placeholder="Teléfono" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="input-field" />
                                <input type="text" placeholder="Dirección" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="input-field" />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => { setShowModal(false); setEditingCustomer(null); }} className="btn-outline">Cancelar</button>
                                <button type="submit" className="btn-primary">{editingCustomer ? 'Actualizar' : 'Guardar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DE HISTORIAL - igual que antes, sin cambios */}
            {showPurchasesModal && selectedCustomer && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Historial de {selectedCustomer.name}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedCustomer.phone || 'Sin teléfono'} | {selectedCustomer.email || 'Sin email'}</p>
                            </div>
                            <button onClick={() => { setShowPurchasesModal(false); setEditingPurchase(null); }} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                                <X size={24} />
                            </button>
                        </div>

                        {purchases.length === 0 ? (
                            <p className="text-slate-400 text-center py-8">Este cliente no tiene compras registradas.</p>
                        ) : (
                            <div className="space-y-4">
                                {purchases.map(p => (
                                    <div key={p.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4">
                                        {editingPurchase === p.id ? (
                                            <div className="flex flex-wrap gap-3 items-end">
                                                <div className="w-full sm:w-auto">
                                                    <label className="block text-xs text-slate-500 dark:text-slate-400">Total</label>
                                                    <input type="number" step="0.01" value={editForm.total} onChange={e => setEditForm({ ...editForm, total: parseFloat(e.target.value) })} className="input-field text-sm py-1 w-full sm:w-32" />
                                                </div>
                                                <div className="w-full sm:w-auto">
                                                    <label className="block text-xs text-slate-500 dark:text-slate-400">Método</label>
                                                    <select value={editForm.payment_method} onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })} className="input-field text-sm py-1 w-full sm:w-auto">
                                                        <option value="efectivo">Efectivo</option>
                                                        <option value="transferencia">Transferencia</option>
                                                        <option value="transfermovil">Transfermóvil</option>
                                                        <option value="tarjeta">Tarjeta</option>
                                                        <option value="otro">Otro</option>
                                                    </select>
                                                </div>
                                                <div className="w-full sm:w-auto">
                                                    <label className="block text-xs text-slate-500 dark:text-slate-400">Transacción</label>
                                                    <input type="text" placeholder="Nro. transacción" value={editForm.transaction_id} onChange={e => setEditForm({ ...editForm, transaction_id: e.target.value })} className="input-field text-sm py-1 w-full sm:w-40" />
                                                </div>
                                                <button onClick={handleSavePurchaseEdit} className="btn-primary text-sm py-1 px-3"><Save size={16} /> Guardar</button>
                                                <button onClick={() => setEditingPurchase(null)} className="btn-outline text-sm py-1 px-3">Cancelar</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm text-slate-500 dark:text-slate-400"><Calendar size={14} className="inline mr-1" />{new Date(p.date).toLocaleString()}</span>
                                                        <span className="text-sm font-semibold text-green-600 dark:text-green-400">{getCurrencySymbol(p.currency || 'CUP')}{p.total?.toFixed(2) || '0.00'}</span>
                                                        <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-300">{p.currency || 'CUP'}</span>
                                                        <span className="text-xs text-slate-500 dark:text-slate-400">{getPaymentMethodLabel(p.payment_method)}</span>
                                                        {p.transaction_id && <span className="text-xs text-slate-400 dark:text-slate-500">ID: {p.transaction_id}</span>}
                                                    </div>
                                                    <button onClick={() => handleEditPurchase(p)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400"><Edit size={16} /></button>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead className="border-b dark:border-slate-700">
                                                            <tr>
                                                                <th className="text-left py-1 text-slate-600 dark:text-slate-400">Producto</th>
                                                                <th className="text-right py-1 text-slate-600 dark:text-slate-400">Cant</th>
                                                                <th className="text-right py-1 text-slate-600 dark:text-slate-400">Precio</th>
                                                                <th className="text-right py-1 text-slate-600 dark:text-slate-400">Subtotal</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {p.items && p.items.map((it, idx) => (
                                                                <tr key={idx}>
                                                                    <td className="py-1 text-slate-700 dark:text-slate-300">{it.product_name}</td>
                                                                    <td className="text-right py-1 text-slate-700 dark:text-slate-300">{it.quantity}</td>
                                                                    <td className="text-right py-1 text-slate-700 dark:text-slate-300">{getCurrencySymbol(p.currency || 'CUP')}{it.price?.toFixed(2) || '0.00'}</td>
                                                                    <td className="text-right py-1 text-slate-700 dark:text-slate-300">{getCurrencySymbol(p.currency || 'CUP')}{(it.quantity * (it.price || 0)).toFixed(2)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-end mt-4">
                            <button onClick={() => { setShowPurchasesModal(false); setEditingPurchase(null); }} className="btn-outline">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}