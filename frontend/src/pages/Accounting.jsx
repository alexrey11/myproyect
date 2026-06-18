import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { db } from '../services/Database';
import { syncService } from '../services/SyncService';
import {
    Plus, Edit, Trash2, Search, Filter,
    X, Save, Calendar, DollarSign, TrendingUp, TrendingDown,
    Wallet, List, PieChart, FileText
} from 'lucide-react';
import axios from 'axios';
import { Pie, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Accounting() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
    const [categories, setCategories] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        type: 'income',
        category: '',
        description: '',
        amount: '',
        currency: 'CUP',
        date: new Date().toISOString().slice(0, 10)
    });
    const [filters, setFilters] = useState({ start: '', end: '', type: '', category: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const { isOnline } = useApp();
    const { getCurrencySymbol } = useCurrency();

    // ========== OBTENER DATOS ==========
    const fetchTransactions = async (start, end, type, category) => {
        setLoading(true);
        try {
            let url = `${API_URL}/transactions`;
            const params = new URLSearchParams();
            if (start) params.append('start', start);
            if (end) params.append('end', end);
            if (type) params.append('type', type);
            if (category) params.append('category', category);
            const query = params.toString();
            if (query) url += `?${query}`;

            if (isOnline) {
                const res = await axios.get(url, { headers: getAuthHeader() });
                setTransactions(res.data);
            } else {
                // Modo offline: obtener desde Dexie
                const localTxs = await db.transactions?.toArray() || [];
                let filtered = localTxs;
                if (start) filtered = filtered.filter(t => t.date >= start);
                if (end) filtered = filtered.filter(t => t.date <= end);
                if (type) filtered = filtered.filter(t => t.type === type);
                if (category) filtered = filtered.filter(t => t.category === category);
                setTransactions(filtered);
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async (start, end) => {
        try {
            const params = new URLSearchParams();
            if (start) params.append('start', start);
            if (end) params.append('end', end);
            const query = params.toString();
            const url = `${API_URL}/transactions/summary${query ? '?' + query : ''}`;

            if (isOnline) {
                const res = await axios.get(url, { headers: getAuthHeader() });
                setSummary(res.data);
            } else {
                // Modo offline: calcular desde local
                const localTxs = await db.transactions?.toArray() || [];
                let filtered = localTxs;
                if (start) filtered = filtered.filter(t => t.date >= start);
                if (end) filtered = filtered.filter(t => t.date <= end);
                const income = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                const expense = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                setSummary({ income, expense, balance: income - expense });
            }
        } catch (err) {
            console.error('Error fetching summary:', err);
        }
    };

    const fetchCategories = async () => {
        try {
            if (isOnline) {
                const res = await axios.get(`${API_URL}/transactions/categories`, { headers: getAuthHeader() });
                setCategories(res.data);
            } else {
                const localTxs = await db.transactions?.toArray() || [];
                const cats = [...new Set(localTxs.map(t => t.category))].filter(Boolean).sort();
                setCategories(cats);
            }
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    };

    useEffect(() => {

        fetchTransactions();
        fetchSummary();
        fetchCategories();
    }, []);

    // ========== CRUD ==========
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = {
                ...formData,
                amount: parseFloat(formData.amount),
                user_id: null // será asignado por el backend
            };
            if (editingId) {
                if (isOnline) {
                    await axios.put(`${API_URL}/transactions/${editingId}`, data, { headers: getAuthHeader() });
                } else {
                    await db.transactions?.update(editingId, { ...data, synced: 0 });
                    await syncService.addToQueue('UPDATE_TRANSACTION', 'transactions', { id: editingId, ...data });
                }
            } else {
                if (isOnline) {
                    const res = await axios.post(`${API_URL}/transactions`, data, { headers: getAuthHeader() });
                    await db.transactions?.add({ ...data, id: res.data.id });
                } else {
                    const id = Date.now();
                    await db.transactions?.add({ ...data, id, synced: 0 });
                    await syncService.addToQueue('CREATE_TRANSACTION', 'transactions', data);
                }
            }
            setShowModal(false);
            setEditingId(null);
            setFormData({ type: 'income', category: '', description: '', amount: '', currency: 'CUP', date: new Date().toISOString().slice(0, 10) });
            fetchTransactions();
            fetchSummary();
            fetchCategories();
        } catch (err) {
            alert('Error al guardar transacción');
            console.error(err);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar esta transacción?')) return;
        try {
            if (isOnline) {
                await axios.delete(`${API_URL}/transactions/${id}`, { headers: getAuthHeader() });
            } else {
                await db.transactions?.delete(id);
                await syncService.addToQueue('DELETE_TRANSACTION', 'transactions', { id });
            }
            fetchTransactions();
            fetchSummary();
        } catch (err) {
            alert('Error al eliminar');
            console.error(err);
        }
    };

    const handleEdit = (tx) => {
        setEditingId(tx.id);
        setFormData({
            type: tx.type,
            category: tx.category,
            description: tx.description || '',
            amount: tx.amount,
            currency: tx.currency || 'CUP',
            date: tx.date.slice(0, 10)
        });
        setShowModal(true);
    };

    const applyFilters = () => {
        fetchTransactions(filters.start, filters.end, filters.type, filters.category);
        fetchSummary(filters.start, filters.end);
    };

    const clearFilters = () => {
        setFilters({ start: '', end: '', type: '', category: '' });
        fetchTransactions();
        fetchSummary();
    };

    // ========== FILTRO Y BÚSQUEDA ==========
    const filtered = transactions.filter(t =>
        t.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ========== DATOS PARA GRÁFICOS ==========
    const incomeByCategory = {};
    const expenseByCategory = {};
    transactions.forEach(t => {
        if (t.type === 'income') {
            incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
        } else {
            expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
        }
    });

    const pieData = {
        labels: Object.keys(expenseByCategory),
        datasets: [{
            data: Object.values(expenseByCategory),
            backgroundColor: ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316'],
            borderWidth: 0
        }]
    };

    const barData = {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{
            label: 'Monto',
            data: [summary.income, summary.expense],
            backgroundColor: ['#22c55e', '#ef4444'],
            borderRadius: 8,
        }]
    };

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    return (
        <div className="space-y-6">
            {/* Cabecera */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Wallet size={24} /> Contabilidad
                </h2>
                <button onClick={() => { setEditingId(null); setFormData({ type: 'income', category: '', description: '', amount: '', currency: 'CUP', date: new Date().toISOString().slice(0, 10) }); setShowModal(true); }} className="btn-primary">
                    <Plus size={18} /> Nueva Transacción
                </button>
            </div>

            {/* Resumen financiero */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-500">
                    <p className="text-sm text-green-600 dark:text-green-400">Ingresos</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">{getCurrencySymbol('CUP')}{summary.income.toFixed(2)}</p>
                </div>
                <div className="card p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-l-red-500">
                    <p className="text-sm text-red-600 dark:text-red-400">Gastos</p>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-300">{getCurrencySymbol('CUP')}{summary.expense.toFixed(2)}</p>
                </div>
                <div className={`card p-4 border-l-4 ${summary.balance >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500' : 'bg-amber-50 dark:bg-amber-900/20 border-l-amber-500'}`}>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Balance</p>
                    <p className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {getCurrencySymbol('CUP')}{summary.balance.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Filtros */}
            <div className="card p-4 dark:bg-slate-800">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 sm:flex-none min-w-[120px]">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Desde</label>
                        <input type="date" value={filters.start} onChange={e => setFilters({ ...filters, start: e.target.value })} className="input-field w-full" />
                    </div>
                    <div className="flex-1 sm:flex-none min-w-[120px]">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hasta</label>
                        <input type="date" value={filters.end} onChange={e => setFilters({ ...filters, end: e.target.value })} className="input-field w-full" />
                    </div>
                    <div className="flex-1 sm:flex-none min-w-[120px]">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo</label>
                        <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })} className="input-field w-full">
                            <option value="">Todos</option>
                            <option value="income">Ingresos</option>
                            <option value="expense">Gastos</option>
                        </select>
                    </div>
                    <div className="flex-1 sm:flex-none min-w-[120px]">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Categoría</label>
                        <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })} className="input-field w-full">
                            <option value="">Todas</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <button onClick={applyFilters} className="btn-primary"><Filter size={18} /> Filtrar</button>
                    <button onClick={clearFilters} className="btn-outline">Limpiar</button>
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-4 dark:bg-slate-800">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Gastos por categoría</h3>
                    <div className="h-48">
                        {Object.keys(expenseByCategory).length > 0 ? (
                            <Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }} />
                        ) : (
                            <p className="text-slate-400 text-center py-4">Sin datos</p>
                        )}
                    </div>
                </div>
                <div className="card p-4 dark:bg-slate-800">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Resumen ingresos vs gastos</h3>
                    <div className="h-48">
                        <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }} />
                    </div>
                </div>
            </div>

            {/* Buscador y lista */}
            <div className="relative">
                <input type="text" placeholder="Buscar por categoría o descripción..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field pl-10" />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            </div>

            {/* Lista de transacciones */}
            <div className="space-y-2">
                {filtered.map(tx => (
                    <div key={tx.id} className="card p-4 dark:bg-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${tx.type === 'income' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {tx.type === 'income' ? '📈 Ingreso' : '📉 Gasto'}
                                </span>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{tx.category}</span>
                                <span className="text-xs text-slate-400 dark:text-slate-500"><Calendar size={12} className="inline mr-1" />{new Date(tx.date).toLocaleDateString()}</span>
                            </div>
                            {tx.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{tx.description}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`font-bold ${tx.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {getCurrencySymbol(tx.currency || 'CUP')}{tx.amount.toFixed(2)}
                            </span>
                            <button onClick={() => handleEdit(tx)} className="text-blue-600 hover:text-blue-800"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(tx.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500">No hay transacciones registradas</div>
                )}
            </div>

            {/* Modal de creación/edición */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-white">
                                {editingId ? 'Editar Transacción' : 'Nueva Transacción'}
                            </h3>
                            <button onClick={() => { setShowModal(false); setEditingId(null); }} className="text-slate-500 hover:text-slate-700">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo</label>
                                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="input-field" required>
                                        <option value="income">Ingreso</option>
                                        <option value="expense">Gasto</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Categoría</label>
                                    <input type="text" placeholder="Ej: Ventas, Compras, Servicios..." value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                                    <input type="text" placeholder="Descripción opcional..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="input-field" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Monto</label>
                                    <input type="number" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="input-field" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Moneda</label>
                                    <select value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })} className="input-field">
                                        <option value="CUP">CUP</option>
                                        <option value="USD">USD</option>
                                        <option value="MLC">MLC</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha</label>
                                    <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="input-field" required />
                                </div>
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