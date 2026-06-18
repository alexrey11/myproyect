import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useWidgets } from '../contexts/WidgetContext';
import { db } from '../services/Database';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement } from 'chart.js';
import { TrendingUp, Package, DollarSign, ShoppingBag, AlertTriangle, Users, Settings } from 'lucide-react';
import axios from 'axios';
import { NotificationService } from '../services/NotificationService';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// ========== COMPONENTES DE WIDGETS ==========
const SalesTodayWidget = ({ stats }) => (
    <div className="card p-4 dark:bg-slate-800">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Ventas de hoy</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">${stats.todaySales.toFixed(2)}</p>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                <DollarSign className="text-green-600 dark:text-green-400" size={24} />
            </div>
        </div>
    </div>
);

const LowStockWidget = ({ lowStockProducts }) => (
    <div className="card p-4 dark:bg-slate-800">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Productos con stock bajo</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{lowStockProducts.length}</p>
            </div>
            <div className="bg-amber-100 dark:bg-amber-900/30 p-3 rounded-full">
                <AlertTriangle className="text-amber-600 dark:text-amber-400" size={24} />
            </div>
        </div>
        {lowStockProducts.length > 0 && (
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {lowStockProducts.slice(0, 3).map(p => (
                    <div key={p.id} className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                        <span>{p.name}</span>
                        <span className="text-red-500">Stock: {p.stock}</span>
                    </div>
                ))}
                {lowStockProducts.length > 3 && <span>+{lowStockProducts.length - 3} más</span>}
            </div>
        )}
    </div>
);

const TopProductsWidget = ({ topProducts }) => (
    <div className="card p-4 dark:bg-slate-800">
        <div className="flex items-center justify-between mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-sm">Productos más vendidos</p>
            <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-full">
                <TrendingUp className="text-purple-600 dark:text-purple-400" size={20} />
            </div>
        </div>
        {topProducts.length > 0 ? (
            <div className="h-40">
                <Doughnut
                    data={{
                        labels: topProducts.map(p => p.name),
                        datasets: [{
                            data: topProducts.map(p => p.total_sold || 0),
                            backgroundColor: ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6'],
                            borderWidth: 0
                        }]
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 8 } } } } }}
                />
            </div>
        ) : (
            <p className="text-slate-400 text-center py-6">Sin datos aún</p>
        )}
    </div>
);

const RecentSalesWidget = ({ recentSales }) => (
    <div className="card p-4 dark:bg-slate-800">
        <div className="flex items-center justify-between mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-sm">Ventas recientes</p>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full">
                <ShoppingBag className="text-blue-600 dark:text-blue-400" size={20} />
            </div>
        </div>
        {recentSales.length > 0 ? (
            <div className="space-y-1">
                {recentSales.slice(0, 5).map(s => (
                    <div key={s.id} className="flex justify-between text-sm border-b border-slate-100 dark:border-slate-700 py-1">
                        <span className="text-slate-600 dark:text-slate-300">{s.customer_name || 'Genérico'}</span>
                        <span className="font-medium text-green-600 dark:text-green-400">${s.total?.toFixed(2) || '0.00'}</span>
                    </div>
                ))}
            </div>
        ) : (
            <p className="text-slate-400 text-center py-6">No hay ventas recientes</p>
        )}
    </div>
);

// ========== COMPONENTE PRINCIPAL ==========
export default function Dashboard() {
    const [stats, setStats] = useState({ totalProducts: 0, lowStockCount: 0, todaySales: 0, totalItemsSold: 0, totalCustomers: 0 });
    const [lowStockProducts, setLowStockProducts] = useState([]);
    const [chartLabels, setChartLabels] = useState([]);
    const [salesData, setSalesData] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [recentSales, setRecentSales] = useState([]);
    const [showWidgetConfig, setShowWidgetConfig] = useState(false);
    const { isOnline } = useApp();
    const { widgets, toggleWidget, resetWidgets } = useWidgets();

    // ========== CARGAR DATOS ==========
    useEffect(() => {
        const fetchData = async () => {
            try {
                if (isOnline) {
                    // 🔥 Modo online: obtener datos de la API
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
                    // 🔥 Modo offline: usar datos locales de IndexedDB
                    const [products, customers, sales] = await Promise.all([
                        db.products.toArray(),
                        db.customers.toArray(),
                        db.sales.toArray()
                    ]);

                    const lowStock = products.filter(p => p.stock <= p.min_stock);
                    setLowStockProducts(lowStock);

                    const today = new Date().toISOString().slice(0, 10);
                    const todaySales = sales.filter(s => s.date && s.date.startsWith(today));
                    const todayTotal = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);

                    const totalItems = sales.reduce((sum, s) => sum + (s.total_items || 0), 0);

                    setStats({
                        totalProducts: products.length,
                        lowStockCount: lowStock.length,
                        todaySales: todayTotal,
                        totalItemsSold: totalItems,
                        totalCustomers: customers.length
                    });

                    // Datos para el gráfico (últimos 7 días)
                    const last7Days = [];
                    const labels = [];
                    for (let i = 6; i >= 0; i--) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        const dayStr = d.toISOString().slice(0, 10);
                        labels.push(dayStr);
                        const daySales = sales.filter(s => s.date && s.date.startsWith(dayStr));
                        last7Days.push(daySales.reduce((sum, s) => sum + (s.total || 0), 0));
                    }
                    setChartLabels(labels);
                    setSalesData(last7Days);

                    // Top productos (offline)
                    const salesItems = await db.saleItems.toArray();
                    const productCounts = {};
                    salesItems.forEach(item => {
                        productCounts[item.product_id] = (productCounts[item.product_id] || 0) + item.quantity;
                    });
                    const sorted = Object.entries(productCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5);
                    const topProd = await Promise.all(sorted.map(async ([id, count]) => {
                        const product = await db.products.get(parseInt(id));
                        return product ? { id: product.id, name: product.name, total_sold: count } : null;
                    }));
                    setTopProducts(topProd.filter(p => p !== null));

                    // Ventas recientes (offline)
                    const recent = sales
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .slice(0, 10);
                    const recentWithCustomers = await Promise.all(recent.map(async (sale) => {
                        const customer = sale.customer_id ? await db.customers.get(sale.customer_id) : null;
                        return {
                            id: sale.id,
                            date: sale.date,
                            total: sale.total,
                            customer_name: customer ? customer.name : 'Cliente genérico'
                        };
                    }));
                    setRecentSales(recentWithCustomers);
                }
            } catch (err) {
                console.error('Error en Dashboard:', err);
                // Si hay error, mostrar datos locales si es posible
                if (!isOnline) {
                    try {
                        const products = await db.products.toArray();
                        const customers = await db.customers.toArray();
                        setStats(prev => ({ ...prev, totalProducts: products.length, totalCustomers: customers.length }));
                    } catch (e) { }
                }
            }
        };
        fetchData();
    }, [isOnline]);

    // ========== PRUEBA DE NOTIFICACIONES ==========
    const sendTestNotification = async () => {
        try {
            await NotificationService.sendTestNotification('📢 ¡Notificación de prueba desde Gestión Pro!');
            alert('✅ Notificación enviada (si tienes permisos, deberías verla)');
        } catch (err) {
            alert('❌ Error enviando notificación: ' + err.message);
        }
    };

    const chartData = {
        labels: chartLabels.length ? chartLabels : ['Sin datos'],
        datasets: [{
            label: 'Ventas',
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

    const visibleWidgets = widgets.filter(w => w.visible);

    return (
        <div className="space-y-6">
            {/* Cabecera con botones de configuración */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Panel de Control</h2>
                    <p className="text-slate-500 dark:text-slate-400">
                        {isOnline ? '🟢 Online' : '🔴 Offline'} - {isOnline ? 'Datos en tiempo real' : 'Datos locales'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={sendTestNotification}
                        className="btn-primary bg-purple-600 hover:bg-purple-700 text-sm"
                        title="Probar notificaciones push"
                    >
                        🔔 Probar Notificación
                    </button>
                    <button
                        onClick={() => setShowWidgetConfig(!showWidgetConfig)}
                        className="btn-outline text-sm"
                        title="Configurar widgets"
                    >
                        <Settings size={18} /> Widgets
                    </button>
                </div>
            </div>

            {/* Configuración de widgets */}
            {showWidgetConfig && (
                <div className="card p-4 dark:bg-slate-800">
                    <div className="flex flex-wrap gap-4 items-center">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Mostrar widgets:</span>
                        {widgets.map(w => (
                            <label key={w.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                <input
                                    type="checkbox"
                                    checked={w.visible}
                                    onChange={() => toggleWidget(w.id)}
                                    className="w-4 h-4 text-blue-600"
                                />
                                {w.icon} {w.label}
                            </label>
                        ))}
                        <button onClick={resetWidgets} className="text-sm text-red-500 hover:text-red-700 dark:text-red-400">
                            Restablecer
                        </button>
                    </div>
                </div>
            )}

            {/* Widgets (grid dinámico) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {visibleWidgets.some(w => w.id === 'sales_today') && (
                    <SalesTodayWidget stats={stats} />
                )}
                {visibleWidgets.some(w => w.id === 'low_stock') && (
                    <LowStockWidget lowStockProducts={lowStockProducts} />
                )}
                {visibleWidgets.some(w => w.id === 'top_products') && (
                    <TopProductsWidget topProducts={topProducts} />
                )}
                {visibleWidgets.some(w => w.id === 'recent_sales') && (
                    <RecentSalesWidget recentSales={recentSales} />
                )}
            </div>

            {/* Gráfico de tendencia (siempre visible) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card p-4 dark:bg-slate-800">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Tendencia de Ventas (últimos 7 días)</h3>
                    <div className="h-60">
                        {chartLabels.length ? (
                            <Line data={chartData} options={chartOptions} />
                        ) : (
                            <p className="text-slate-400 dark:text-slate-500 text-center py-10">No hay datos de ventas aún</p>
                        )}
                    </div>
                </div>

                <div className="card p-4 dark:bg-slate-800">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Estadísticas rápidas</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                            <span className="text-slate-600 dark:text-slate-300">Productos</span>
                            <span className="font-bold text-slate-800 dark:text-white">{stats.totalProducts}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                            <span className="text-slate-600 dark:text-slate-300">Clientes</span>
                            <span className="font-bold text-slate-800 dark:text-white">{stats.totalCustomers}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                            <span className="text-slate-600 dark:text-slate-300">Items vendidos</span>
                            <span className="font-bold text-slate-800 dark:text-white">{stats.totalItemsSold}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 dark:text-slate-300">Stock bajo</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">{stats.lowStockCount}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}