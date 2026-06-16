import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { db } from '../services/Database';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement } from 'chart.js';
import { TrendingUp, Package, DollarSign, ShoppingBag, AlertTriangle, Users, CreditCard, Clock } from 'lucide-react';
import axios from 'axios';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

const API_URL = 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Dashboard() {
    const [stats, setStats] = useState({ totalProducts: 0, lowStockCount: 0, todaySales: 0, totalItemsSold: 0, totalCustomers: 0 });
    const [lowStockProducts, setLowStockProducts] = useState([]);
    const [chartLabels, setChartLabels] = useState([]);
    const [salesData, setSalesData] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [recentSales, setRecentSales] = useState([]);
    const { isOnline } = useApp();

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (isOnline) {
                    const [statsRes, lowStockRes, dailyRes, topProductsRes, recentSalesRes] = await Promise.all([
                        axios.get(`${API_URL}/dashboard/stats`, { headers: getAuthHeader() }),
                        axios.get(`${API_URL}/products/low-stock`, { headers: getAuthHeader() }),
                        axios.get(`${API_URL}/sales/daily?days=7`, { headers: getAuthHeader() }),
                        axios.get(`${API_URL}/dashboard/top-products`, { headers: getAuthHeader() }),
                        axios.get(`${API_URL}/sales/recent`, { headers: getAuthHeader() })
                    ]);
                    setStats(prev => ({ ...prev, ...statsRes.data }));
                    setLowStockProducts(lowStockRes.data);
                    const labels = dailyRes.data.map(item => item.day);
                    const totals = dailyRes.data.map(item => item.total);
                    setChartLabels(labels);
                    setSalesData(totals);
                    setTopProducts(topProductsRes.data || []);
                    setRecentSales(recentSalesRes.data || []);
                } else {
                    // Modo offline
                    const [products, customers, sales] = await Promise.all([
                        db.products.toArray(),
                        db.customers.toArray(),
                        db.sales.toArray()
                    ]);
                    const lowStock = products.filter(p => p.stock <= p.min_stock);
                    setLowStockProducts(lowStock);
                    setStats({
                        totalProducts: products.length,
                        lowStockCount: lowStock.length,
                        todaySales: sales.reduce((sum, s) => sum + (s.total || 0), 0),
                        totalItemsSold: 0,
                        totalCustomers: customers.length
                    });
                    setTopProducts([]);
                    setRecentSales(sales.slice(0, 5));
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, [isOnline]);

    const chartData = {
        labels: chartLabels.length ? chartLabels : ['Sin datos'],
        datasets: [{
            label: 'Ventas (USD)',
            data: salesData.length ? salesData : [0],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#2563eb',
        }]
    };
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, padding: 20, color: '#475569' } }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#475569' } },
            x: { grid: { display: false }, ticks: { color: '#475569' } }
        }
    };

    // Gráfico de productos más vendidos (Doughnut)
    const doughnutData = {
        labels: topProducts.map(p => p.name),
        datasets: [{
            data: topProducts.map(p => p.total_sold || 0),
            backgroundColor: ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6'],
            borderWidth: 0
        }]
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Panel de Control</h2>
                <p className="text-slate-500 dark:text-slate-400">Resumen de tu negocio</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="card p-4 hover:scale-[1.02] transition-transform dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                        <div><p className="text-slate-500 dark:text-slate-400 text-xs">Productos</p><p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalProducts}</p></div>
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full"><Package className="text-blue-700 dark:text-blue-400" size={20} /></div>
                    </div>
                </div>
                <div className="card p-4 hover:scale-[1.02] transition-transform dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                        <div><p className="text-slate-500 dark:text-slate-400 text-xs">Stock Bajo</p><p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.lowStockCount}</p></div>
                        <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full"><AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} /></div>
                    </div>
                </div>
                <div className="card p-4 hover:scale-[1.02] transition-transform dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                        <div><p className="text-slate-500 dark:text-slate-400 text-xs">Ventas Hoy</p><p className="text-2xl font-bold text-green-600 dark:text-green-400">${stats.todaySales.toFixed(2)}</p></div>
                        <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full"><DollarSign className="text-green-600 dark:text-green-400" size={20} /></div>
                    </div>
                </div>
                <div className="card p-4 hover:scale-[1.02] transition-transform dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                        <div><p className="text-slate-500 dark:text-slate-400 text-xs">Items Vendidos</p><p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.totalItemsSold}</p></div>
                        <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-full"><ShoppingBag className="text-purple-600 dark:text-purple-400" size={20} /></div>
                    </div>
                </div>
                <div className="card p-4 hover:scale-[1.02] transition-transform dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                        <div><p className="text-slate-500 dark:text-slate-400 text-xs">Clientes</p><p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.totalCustomers}</p></div>
                        <div className="bg-cyan-100 dark:bg-cyan-900/30 p-2 rounded-full"><Users className="text-cyan-600 dark:text-cyan-400" size={20} /></div>
                    </div>
                </div>
            </div>

            {lowStockProducts.length > 0 && (
                <div className="card p-4 border-l-4 border-l-amber-500 dark:border-l-amber-400 dark:bg-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="text-amber-500 dark:text-amber-400" size={18} />
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Productos con stock bajo</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {lowStockProducts.slice(0, 5).map(p => (
                            <span key={p.id} className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full">{p.name} ({p.stock})</span>
                        ))}
                        {lowStockProducts.length > 5 && <span className="text-xs text-slate-400">+{lowStockProducts.length - 5} más</span>}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card p-4 dark:bg-slate-800">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Tendencia de Ventas (últimos 7 días)</h3>
                    <div className="h-60">{chartLabels.length ? <Line data={chartData} options={chartOptions} /> : <p className="text-slate-400 text-center py-10">No hay datos de ventas aún</p>}</div>
                </div>

                <div className="card p-4 dark:bg-slate-800">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Productos más vendidos</h3>
                    {topProducts.length > 0 ? (
                        <div className="h-60"><Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }} /></div>
                    ) : (
                        <p className="text-slate-400 text-center py-10">Sin datos aún</p>
                    )}
                </div>
            </div>

            {/* Ventas recientes */}
            {recentSales.length > 0 && (
                <div className="card p-4 dark:bg-slate-800">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Clock size={16} /> Ventas recientes</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b dark:border-slate-700"><tr><th className="text-left py-2 text-slate-500 dark:text-slate-400">Fecha</th><th className="text-left text-slate-500 dark:text-slate-400">Cliente</th><th className="text-right text-slate-500 dark:text-slate-400">Total</th></tr></thead>
                            <tbody>
                                {recentSales.map(s => (
                                    <tr key={s.id} className="border-b border-slate-100 dark:border-slate-700/50">
                                        <td className="py-2 text-slate-600 dark:text-slate-300">{new Date(s.date).toLocaleString()}</td>
                                        <td className="py-2 text-slate-600 dark:text-slate-300">{s.customer_name || 'Genérico'}</td>
                                        <td className="py-2 text-right text-green-600 dark:text-green-400 font-semibold">${s.total?.toFixed(2) || '0.00'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}