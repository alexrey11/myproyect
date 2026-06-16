import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { db } from '../services/Database';
import { syncService } from '../services/SyncService';
import { FileText, User, Calendar, DollarSign, Download, Filter, Edit, Save, X, CreditCard } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function SalesReport() {
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterApplied, setFilterApplied] = useState(false);
    const [editingSale, setEditingSale] = useState(null);
    const [editForm, setEditForm] = useState({ total: 0, payment_method: 'efectivo', transaction_id: '' });
    const { isOnline } = useApp();
    const { currencies, getCurrencySymbol, formatPrice } = useCurrency();

    const fetchSales = async (start, end) => {
        setLoading(true);
        try {
            if (isOnline) {
                let url = `${API_URL}/sales`;
                if (start || end) {
                    const params = new URLSearchParams();
                    if (start) params.append('start', start);
                    if (end) params.append('end', end);
                    url += `?${params.toString()}`;
                }
                const res = await axios.get(url, { headers: getAuthHeader() });
                setSales(res.data);
            } else {
                const localSales = await db.sales.toArray();
                const salesWithDetails = await Promise.all(localSales.map(async (sale) => {
                    const items = await db.saleItems.where('sale_id').equals(sale.id).toArray();
                    const customer = sale.customer_id ? await db.customers.get(sale.customer_id) : null;
                    return {
                        id: sale.id,
                        date: sale.date,
                        total: sale.total,
                        currency: sale.currency || 'CUP',
                        payment_method: sale.payment_method || 'efectivo',
                        transaction_id: sale.transaction_id || '',
                        customer_name: customer ? customer.name : 'Cliente genérico',
                        customer_id: sale.customer_id,
                        items: items
                    };
                }));
                setSales(salesWithDetails);
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchSales(); }, [isOnline]);

    const handleFilter = () => { fetchSales(startDate, endDate); setFilterApplied(true); };
    const clearFilter = () => { setStartDate(''); setEndDate(''); fetchSales(); setFilterApplied(false); };

    // Calcular totales correctos
    const calculateTotals = () => {
        const totals = {};
        sales.forEach(sale => {
            const currency = sale.currency || 'CUP';
            if (!totals[currency]) totals[currency] = 0;
            totals[currency] += sale.total || 0;
        });
        return totals;
    };

    const totals = calculateTotals();

    const exportCSV = () => {
        if (!sales.length) return alert('No hay datos para exportar');
        const headers = ['ID', 'Fecha', 'Cliente', 'Moneda', 'Total', 'Método de Pago', 'Transacción'];
        const rows = sales.map(s => [
            s.id,
            new Date(s.date).toLocaleString(),
            s.customer_name || 'Genérico',
            s.currency || 'CUP',
            s.total || 0,
            s.payment_method || 'efectivo',
            s.transaction_id || ''
        ]);
        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ventas.csv';
        a.click();
    };

    const handleEditSale = (sale) => {
        setEditingSale(sale.id);
        setEditForm({
            total: sale.total || 0,
            payment_method: sale.payment_method || 'efectivo',
            transaction_id: sale.transaction_id || ''
        });
    };

    const handleSaveEdit = async () => {
        try {
            if (isOnline) {
                await axios.put(`${API_URL}/sales/${editingSale}`, editForm, { headers: getAuthHeader() });
            } else {
                await db.sales.update(editingSale, {
                    total: editForm.total,
                    payment_method: editForm.payment_method,
                    transaction_id: editForm.transaction_id,
                    synced: 0
                });
                await syncService.addToQueue('UPDATE_SALE', 'sales', { id: editingSale, ...editForm });
            }
            setEditingSale(null);
            fetchSales();
        } catch (err) {
            alert('Error al actualizar venta');
            console.error(err);
        }
    };

    const getTotalDisplay = (sale) => {
        const symbol = getCurrencySymbol(sale.currency || 'CUP');
        return `${symbol}${(sale.total || 0).toFixed(2)}`;
    };

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
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><FileText size={24} /> Reporte de Ventas</h2>
                <button onClick={exportCSV} className="btn-primary bg-green-600 hover:bg-green-700"><Download size={18} /> Exportar CSV</button>
            </div>

            <div className="card p-4 dark:bg-slate-800">
                <div className="flex flex-wrap gap-4 items-end">
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Desde</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hasta</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field" /></div>
                    <button onClick={handleFilter} className="btn-primary"><Filter size={18} /> Filtrar</button>
                    {filterApplied && <button onClick={clearFilter} className="btn-outline">Limpiar</button>}
                </div>
            </div>

            {/* Resumen de totales por moneda */}
            {Object.keys(totals).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(totals).map(([currency, total]) => (
                        <div key={currency} className="card p-3 text-center dark:bg-slate-800">
                            <p className="text-xs text-slate-500 dark:text-slate-400">{currency}</p>
                            <p className="text-xl font-bold text-green-600 dark:text-green-400">{getCurrencySymbol(currency)}{total.toFixed(2)}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="card overflow-hidden dark:bg-slate-800">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">ID</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Fecha</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Cliente</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Moneda</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Método</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Transacción</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Total</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                            {sales.map(s => (
                                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    {editingSale === s.id ? (
                                        <>
                                            <td className="px-4 py-2">#{s.id}</td>
                                            <td className="px-4 py-2">{new Date(s.date).toLocaleString()}</td>
                                            <td className="px-4 py-2">{s.customer_name || 'Genérico'}</td>
                                            <td className="px-4 py-2">{s.currency || 'CUP'}</td>
                                            <td className="px-4 py-2">
                                                <select value={editForm.payment_method} onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })} className="input-field text-sm py-1">
                                                    <option value="efectivo">Efectivo</option>
                                                    <option value="transferencia">Transferencia</option>
                                                    <option value="transfermovil">Transfermóvil</option>
                                                    <option value="tarjeta">Tarjeta</option>
                                                    <option value="otro">Otro</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="text" placeholder="Nro. transacción" value={editForm.transaction_id} onChange={e => setEditForm({ ...editForm, transaction_id: e.target.value })} className="input-field text-sm py-1 w-32" />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <input type="number" step="0.01" value={editForm.total} onChange={e => setEditForm({ ...editForm, total: parseFloat(e.target.value) })} className="input-field text-sm py-1 w-24 text-right" />
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-800 mr-2"><Save size={18} /></button>
                                                <button onClick={() => setEditingSale(null)} className="text-red-500 hover:text-red-700"><X size={18} /></button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">#{s.id}</td>
                                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300"><Calendar size={14} className="inline mr-1" />{new Date(s.date).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.customer_name || 'Genérico'}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.currency || 'CUP'}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{getPaymentMethodLabel(s.payment_method)}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-sm">{s.transaction_id || '-'}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">{getTotalDisplay(s)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => handleEditSale(s)} className="text-blue-600 hover:text-blue-800"><Edit size={16} /></button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                            {!sales.length && <tr><td colSpan="8" className="text-center py-8 text-slate-400 dark:text-slate-500">No hay ventas registradas</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}