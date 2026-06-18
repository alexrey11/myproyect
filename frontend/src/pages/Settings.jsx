import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { db } from '../services/Database';
import { Save, Plus, Trash2, Edit, X } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Settings() {
    const { companySettings, setCompanySettings, currencies, setCurrencies, baseCurrency, setBaseCurrency, addNotification } = useApp();
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        phone: '',
        email: '',
        taxId: '',
        logo: ''
    });
    const [currencyForm, setCurrencyForm] = useState({
        code: '',
        name: '',
        symbol: '',
        exchangeRate: 1,
        isBase: false,
        isActive: true
    });
    const [editingCurrencyId, setEditingCurrencyId] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (companySettings) {
            setFormData({
                name: companySettings.name || '',
                address: companySettings.address || '',
                phone: companySettings.phone || '',
                email: companySettings.email || '',
                taxId: companySettings.taxId || '',
                logo: companySettings.logo || ''
            });
        }
    }, [companySettings]);

    const handleCompanySubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const settingsId = companySettings.id || 1;
            await db.companySettings.update(settingsId, formData);
            const updated = await db.companySettings.get(settingsId);
            setCompanySettings(updated);
            addNotification('success', 'Configuración de empresa actualizada');
            toast.success('Configuración guardada');
        } catch (err) {
            console.error(err);
            toast.error('Error al guardar');
        } finally {
            setLoading(false);
        }
    };

    const handleCurrencySubmit = async (e) => {
        e.preventDefault();
        try {
            if (currencyForm.isBase) {
                // Si esta moneda es base, desactivar la base anterior
                const previousBase = currencies.find(c => c.isBase);
                if (previousBase && previousBase.id !== editingCurrencyId) {
                    await db.currencies.update(previousBase.id, { isBase: false });
                }
                setBaseCurrency(currencyForm);
            }

            if (editingCurrencyId) {
                await db.currencies.update(editingCurrencyId, currencyForm);
            } else {
                const id = Date.now();
                await db.currencies.add({ ...currencyForm, id });
            }
            const updatedCurrencies = await db.currencies.toArray();
            setCurrencies(updatedCurrencies);
            setCurrencyForm({ code: '', name: '', symbol: '', exchangeRate: 1, isBase: false, isActive: true });
            setEditingCurrencyId(null);
            toast.success('Moneda guardada');
        } catch (err) {
            console.error(err);
            toast.error('Error al guardar moneda');
        }
    };

    const deleteCurrency = async (id) => {
        if (currencies.find(c => c.id === id)?.isBase) {
            toast.warning('No se puede eliminar la moneda base');
            return;
        }
        if (!confirm('¿Eliminar esta moneda?')) return;
        try {
            await db.currencies.delete(id);
            const updatedCurrencies = await db.currencies.toArray();
            setCurrencies(updatedCurrencies);
            toast.success('Moneda eliminada');
        } catch (err) {
            console.error(err);
            toast.error('Error al eliminar');
        }
    };
    const sendTestTelegram = async () => {
        try {
            await axios.post(
                `${API_URL}/telegram/send`,
                { message: '🔔 Mensaje de prueba desde Gestión Pro' },
                { headers: getAuthHeader() }
            );
            alert('✅ Mensaje enviado a Telegram');
        } catch (err) {
            alert('❌ Error enviando mensaje');
        }
    };

    const editCurrency = (currency) => {
        setEditingCurrencyId(currency.id);
        setCurrencyForm({
            code: currency.code,
            name: currency.name,
            symbol: currency.symbol,
            exchangeRate: currency.exchangeRate,
            isBase: currency.isBase || false,
            isActive: currency.isActive !== undefined ? currency.isActive : true
        });
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Configuración</h2>

            {/* Configuración de Empresa */}
            <div className="card p-5 dark:bg-slate-800 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Datos de la Empresa</h3>
                <form onSubmit={handleCompanySubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre del Negocio</label>
                            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dirección</label>
                            <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                            <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                            <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">NIT / RUC</label>
                            <input type="text" value={formData.taxId} onChange={e => setFormData({ ...formData, taxId: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                        </div>
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading}>
                        <Save size={18} /> {loading ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                </form>
            </div>

            {/* Gestión de Monedas */}
            <div className="card p-5 dark:bg-slate-800 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Monedas</h3>
                <form onSubmit={handleCurrencySubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Código</label>
                        <input type="text" placeholder="CUP" value={currencyForm.code} onChange={e => setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                        <input type="text" placeholder="Peso Cubano" value={currencyForm.name} onChange={e => setCurrencyForm({ ...currencyForm, name: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Símbolo</label>
                        <input type="text" placeholder="₱" value={currencyForm.symbol} onChange={e => setCurrencyForm({ ...currencyForm, symbol: e.target.value })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tasa (vs Base)</label>
                        <input type="number" step="0.01" value={currencyForm.exchangeRate} onChange={e => setCurrencyForm({ ...currencyForm, exchangeRate: parseFloat(e.target.value) })} className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                    </div>
                    <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={currencyForm.isBase} onChange={e => setCurrencyForm({ ...currencyForm, isBase: e.target.checked })} className="w-4 h-4" /> Base
                        </label>
                        <button type="submit" className="btn-primary flex-1">
                            {editingCurrencyId ? <Save size={18} /> : <Plus size={18} />} {editingCurrencyId ? 'Actualizar' : 'Agregar'}
                        </button>
                        {editingCurrencyId && (
                            <button type="button" onClick={() => { setEditingCurrencyId(null); setCurrencyForm({ code: '', name: '', symbol: '', exchangeRate: 1, isBase: false, isActive: true }); }} className="btn-outline">
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </form>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-700">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Código</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Nombre</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Símbolo</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Tasa</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Base</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100 dark:bg-slate-800 dark:divide-slate-700">
                            {currencies.map(c => (
                                <tr key={c.id}>
                                    <td className="px-4 py-2 text-sm font-medium text-slate-800 dark:text-white">{c.code}</td>
                                    <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">{c.name}</td>
                                    <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">{c.symbol}</td>
                                    <td className="px-4 py-2 text-sm text-right text-slate-600 dark:text-slate-300">{c.exchangeRate}</td>
                                    <td className="px-4 py-2 text-center">{c.isBase && <span className="badge-stock badge-stock-high">Base</span>}</td>
                                    <td className="px-4 py-2 text-right">
                                        <button onClick={() => editCurrency(c)} className="text-blue-600 hover:text-blue-800 mr-2"><Edit size={16} /></button>
                                        <button onClick={() => deleteCurrency(c.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}