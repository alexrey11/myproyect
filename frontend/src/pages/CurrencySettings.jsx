import React, { useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { db } from '../services/Database';
import { Plus, Edit, Trash2, Check, X, DollarSign } from 'lucide-react';

export default function CurrencySettings() {
    const { currencies, defaultCurrency, setDefaultCurrencyById, addCurrency, updateCurrency } = useCurrency();
    const [showModal, setShowModal] = useState(false);
    const [editingCurrency, setEditingCurrency] = useState(null);
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        symbol: '$',
        exchange_rate: 1,
        is_default: false,
        active: true
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCurrency) {
                await updateCurrency(editingCurrency.id, formData);
            } else {
                await addCurrency(formData);
            }
            setShowModal(false);
            setEditingCurrency(null);
            setFormData({ code: '', name: '', symbol: '$', exchange_rate: 1, is_default: false, active: true });
        } catch (err) {
            console.error(err);
            alert('Error al guardar moneda');
        }
    };

    const handleEdit = (currency) => {
        setEditingCurrency(currency);
        setFormData({
            code: currency.code,
            name: currency.name,
            symbol: currency.symbol,
            exchange_rate: currency.exchange_rate,
            is_default: currency.is_default || false,
            active: currency.active !== undefined ? currency.active : true
        });
        setShowModal(true);
    };

    const handleSetDefault = async (id) => {
        await setDefaultCurrencyById(id);
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar esta moneda?')) return;
        await db.currencies.delete(id);
        window.location.reload();
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <DollarSign size={24} /> Configuración de Monedas
                </h2>
                <button onClick={() => { setEditingCurrency(null); setFormData({ code: '', name: '', symbol: '$', exchange_rate: 1, is_default: false, active: true }); setShowModal(true); }} className="btn-primary">
                    <Plus size={18} /> Nueva Moneda
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {currencies.map(currency => (
                    <div key={currency.id} className="card p-5 hover:shadow-lg dark:bg-slate-800">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{currency.symbol}</span>
                                    <span className="text-lg font-semibold text-slate-800 dark:text-white">{currency.code}</span>
                                    {currency.is_default && (
                                        <span className="badge-stock badge-stock-high">Predeterminada</span>
                                    )}
                                    {!currency.active && (
                                        <span className="badge-stock badge-stock-low">Inactiva</span>
                                    )}
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{currency.name}</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                                    Tasa: 1 {currency.code} = {currency.exchange_rate} CUP
                                </p>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => handleEdit(currency)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                                    <Edit size={16} />
                                </button>
                                {!currency.is_default && (
                                    <button onClick={() => handleDelete(currency.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                        {!currency.is_default && (
                            <button onClick={() => handleSetDefault(currency.id)} className="mt-3 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
                                Establecer como predeterminada
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl animate-slide-up">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
                            {editingCurrency ? 'Editar Moneda' : 'Nueva Moneda'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Código</label>
                                    <input type="text" placeholder="Ej: USD, EUR, CUP" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                                    <input type="text" placeholder="Ej: Dólar Estadounidense" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Símbolo</label>
                                    <input type="text" placeholder="Ej: $, €, US$" value={formData.symbol} onChange={e => setFormData({ ...formData, symbol: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tasa de cambio (1 unidad = X CUP)</label>
                                    <input type="number" step="0.01" placeholder="Ej: 600" value={formData.exchange_rate} onChange={e => setFormData({ ...formData, exchange_rate: parseFloat(e.target.value) || 1 })} className="input-field" required />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="is_default" checked={formData.is_default} onChange={e => setFormData({ ...formData, is_default: e.target.checked })} className="w-4 h-4 text-blue-600" />
                                    <label htmlFor="is_default" className="text-sm text-slate-700 dark:text-slate-300">Establecer como predeterminada</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="active" checked={formData.active} onChange={e => setFormData({ ...formData, active: e.target.checked })} className="w-4 h-4 text-blue-600" />
                                    <label htmlFor="active" className="text-sm text-slate-700 dark:text-slate-300">Activa</label>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => { setShowModal(false); setEditingCurrency(null); }} className="btn-outline">Cancelar</button>
                                <button type="submit" className="btn-primary">{editingCurrency ? 'Actualizar' : 'Guardar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}