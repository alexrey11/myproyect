import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { CartProvider } from './contexts/CartContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { CurrencyProvider, useCurrency } from './contexts/CurrencyContext';
import { WidgetProvider } from './contexts/WidgetContext';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import POS from './pages/POS';
import Customers from './pages/Customers';
import SalesReport from './pages/SalesReport';
import Login from './pages/Login';
import CurrencySettings from './pages/CurrencySettings';
import Suppliers from './pages/Suppliers';
import InventoryReport from './pages/InventoryReport';
import Users from './pages/Users';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users as UsersIcon,
  FileText,
  LogOut,
  Menu,
  X,
  Wifi,
  WifiOff,
  Store,
  DollarSign,
  Sun,
  Moon,
  AlertTriangle,
  Truck,
  ClipboardList
} from 'lucide-react';
import axios from 'axios';
import { NotificationService } from './services/NotificationService';

const API_URL = 'http://localhost:3001/api';
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const PrivateRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen">Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/pos" />;
  return children;
};

function AppContent() {
  const { user, logout } = useAuth();
  const { isOnline, syncing } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [lowStockNotifications, setLowStockNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Verificar stock bajo al cargar
  useEffect(() => {
    const checkStock = async () => {
      try {
        const res = await axios.get(`${API_URL}/notifications/low-stock`, { headers: getAuthHeader() });
        if (res.data.length > 0) {
          setLowStockNotifications(res.data);
          setShowNotifications(true);
          setTimeout(() => setShowNotifications(false), 6000);
        }
      } catch (err) { console.error(err); }
    };
    if (user) checkStock();
  }, [user]);

  // ========== SUSCRIBIR A NOTIFICACIONES PUSH ==========
  useEffect(() => {
    if (user) {
      // Intentar suscribir a notificaciones push (solo si el navegador lo soporta)
      NotificationService.subscribeToPushNotifications()
        .catch(err => console.warn('Error suscribiendo a notificaciones:', err));
    }
  }, [user]);

  if (!user) return null;

  const navItems = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} />, adminOnly: false },
    { path: '/products', label: 'Productos', icon: <Package size={20} />, adminOnly: true },
    { path: '/customers', label: 'Clientes', icon: <UsersIcon size={20} />, adminOnly: true },
    { path: '/pos', label: 'Ventas', icon: <ShoppingCart size={20} />, adminOnly: false },
    { path: '/sales-report', label: 'Reportes', icon: <FileText size={20} />, adminOnly: false },
    { path: '/currency-settings', label: 'Monedas', icon: <DollarSign size={20} />, adminOnly: true },
    { path: '/suppliers', label: 'Proveedores', icon: <Truck size={20} />, adminOnly: true },
    { path: '/inventory-report', label: 'Inventario', icon: <ClipboardList size={20} />, adminOnly: true },
    { path: '/users', label: 'Usuarios', icon: <UsersIcon size={20} />, adminOnly: true },
  ];

  const toggleDarkMode = () => setDarkMode(!darkMode);

  return (
    <div className="flex h-screen">
      <aside className="hidden md:flex md:flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between px-6 h-16 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <Store className="text-blue-700 dark:text-blue-400" size={28} />
            <span className="text-xl font-bold text-slate-800 dark:text-white">Gestión Pro</span>
          </div>
          <button onClick={toggleDarkMode} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}
          </button>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.filter(item => !item.adminOnly || user.role === 'admin').map(item => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 
              ${isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`
            }>
              {item.icon} {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">{user.username} ({user.role})</span>
            <button onClick={logout} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <Menu size={24} className="text-slate-700 dark:text-slate-300" />
            </button>
            <h1 className="text-xl font-semibold text-slate-800 dark:text-white">Gestión Pro</h1>
            <button onClick={toggleDarkMode} className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {syncing && <span className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">Sincronizando...</span>}
            {isOnline ? <Wifi size={18} className="text-green-600 dark:text-green-400" /> : <WifiOff size={18} className="text-red-500 dark:text-red-400" />}
            <span className="text-sm text-slate-500 dark:text-slate-400 hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </header>

        {showNotifications && lowStockNotifications.length > 0 && (
          <div className="fixed top-20 right-4 z-50 bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 p-4 rounded-lg shadow-lg max-w-sm animate-slide-up">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={20} />
              <h4 className="font-semibold text-red-700 dark:text-red-300">Stock bajo</h4>
            </div>
            <ul className="text-sm mt-2">
              {lowStockNotifications.slice(0, 3).map(p => (
                <li key={p.id} className="text-slate-700 dark:text-slate-300">{p.name}: {p.stock} (mín {p.min_stock})</li>
              ))}
              {lowStockNotifications.length > 3 && <li className="text-slate-500">+{lowStockNotifications.length - 3} más</li>}
            </ul>
          </div>
        )}

        <div className="p-4 md:p-6">
          <Routes>
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/products" element={<PrivateRoute adminOnly><Products /></PrivateRoute>} />
            <Route path="/pos" element={<PrivateRoute><POS /></PrivateRoute>} />
            <Route path="/customers" element={<PrivateRoute adminOnly><Customers /></PrivateRoute>} />
            <Route path="/sales-report" element={<PrivateRoute><SalesReport /></PrivateRoute>} />
            <Route path="/currency-settings" element={<PrivateRoute adminOnly><CurrencySettings /></PrivateRoute>} />
            <Route path="/suppliers" element={<PrivateRoute adminOnly><Suppliers /></PrivateRoute>} />
            <Route path="/inventory-report" element={<PrivateRoute adminOnly><InventoryReport /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute adminOnly><Users /></PrivateRoute>} />
          </Routes>
        </div>
      </main>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)}></div>
          <div className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between px-6 h-16 border-b border-slate-200 dark:border-slate-700">
              <span className="text-xl font-bold text-slate-800 dark:text-white">Gestión Pro</span>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={24} className="text-slate-600 dark:text-slate-300" />
              </button>
            </div>
            <nav className="px-4 py-6 space-y-1">
              {navItems.filter(item => !item.adminOnly || user.role === 'admin').map(item => (
                <NavLink key={item.path} to={item.path} onClick={() => setSidebarOpen(false)} className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 
                  ${isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`
                }>
                  {item.icon} {item.label}
                </NavLink>
              ))}
              <button onClick={() => { logout(); setSidebarOpen(false); }} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 w-full">
                <LogOut size={20} /> Cerrar sesión
              </button>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <CurrencyProvider>
          <WidgetProvider>
            <CartProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="*" element={<AppContent />} />
                </Routes>
              </BrowserRouter>
            </CartProvider>
          </WidgetProvider>
        </CurrencyProvider>
      </AppProvider>
    </AuthProvider>
  );
}

export default App; 
