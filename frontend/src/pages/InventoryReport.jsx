import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { db } from '../services/Database';
import { Package, DollarSign } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function InventoryReport() {
    const [inventory, setInventory] = useState({ items: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { isOnline } = useApp();

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (isOnline) {
                    const res = await axios.get(`${API_URL}/inventory/valuation`, { headers: getAuthHeader() });
                    setInventory(res.data);
                } else {
                    const products = await db.products.toArray();
                    const items = products
                        .filter(p => p.stock > 0)
                        .map(p => ({
                            id: p.id,
                            name: p.name,
                            stock: p.stock,
                            price: p.price || 0,
                            total_value: (p.stock || 0) * (p.price || 0)
                        }));
                    const total = items.reduce((sum, item) => sum + item.total_value, 0);
                    setInventory({ items, total });
                }
            } catch (err) {
                console.error(err);
                setError('Error al cargar el reporte de inventario');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [isOnline]);

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    if (error) {
        return (
            <div className="card p-8 text-center dark:bg-slate-800">
                <div className="text-6xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Error al cargar el inventario</h3>
                <p className="text-slate-600 dark:text-slate-400">{error}</p>
                <button onClick={() => window.location.reload()} className="btn-primary mt-4">Reintentar</button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Package size={24} /> Valoración de Inventario</h2>
                <div className="card p-4 bg-green-50 dark:bg-green-900/30 w-full sm:w-auto">
                    <p className="text-sm text-slate-600 dark:text-slate-300">Total inventario</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">${inventory.total.toFixed(2)}</p>
                </div>
            </div>

            <div className="hidden md:block card overflow-hidden dark:bg-slate-800">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Producto</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Stock</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Precio</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                            {inventory.items.length === 0 ? (
                                <tr><td colSpan="4" className="text-center py-8 text-slate-400 dark:text-slate-500">No hay productos en inventario</td></tr>
                            ) : (
                                inventory.items.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">{item.name}</td>
                                        <td className="px-6 py-4 text-center text-slate-600 dark:text-slate-300">{item.stock}</td>
                                        <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-300">${item.price?.toFixed(2) || '0.00'}</td>
                                        <td className="px-6 py-4 text-right font-semibold text-green-600 dark:text-green-400">${(item.total_value || 0).toFixed(2)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-bold">
                            <tr>
                                <td colSpan="3" className="px-6 py-3 text-right text-slate-700 dark:text-slate-300">TOTAL</td>
                                <td className="px-6 py-3 text-right text-green-600 dark:text-green-400">${inventory.total.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div className="md:hidden space-y-4">
                {inventory.items.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500">No hay productos en inventario</div>
                ) : (
                    inventory.items.map(item => (
                        <div key={item.id} className="card p-4 dark:bg-slate-800">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-semibold text-slate-800 dark:text-white">{item.name}</h3>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">Stock: {item.stock}</span>
                                        <span className="text-sm text-slate-500 dark:text-slate-400">Precio: ${item.price?.toFixed(2) || '0.00'}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Valor</p>
                                    <p className="text-lg font-bold text-green-600 dark:text-green-400">${(item.total_value || 0).toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {inventory.items.length > 0 && (
                    <div className="card p-4 bg-green-50 dark:bg-green-900/30 text-center">
                        <p className="text-sm text-slate-600 dark:text-slate-300">Total inventario</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">${inventory.total.toFixed(2)}</p>
                    </div>
                )}
            </div>
        </div>
    );
}