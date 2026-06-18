import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useApp } from '../contexts/AppContext';
import { db } from '../services/Database';
import { syncService } from '../services/SyncService';
import { ShoppingBag, Plus, Trash2, Search, Save, X, Truck } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Purchases() {
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [cart, setCart] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [total, setTotal] = useState(0);
    const [purchases, setPurchases] = useState([]);
    const [showCart, setShowCart] = useState(false);
    const { isOnline } = useApp();

    useEffect(() => {
        const loadData = async () => {
            try {
                if (!isOnline) return;
                const [suppliersRes, productsRes, purchasesRes] = await Promise.all([
                    axios.get(`${API_URL}/suppliers`, { headers: getAuthHeader() }),
                    axios.get(`${API_URL}/products`, { headers: getAuthHeader() }),
                    axios.get(`${API_URL}/purchases`, { headers: getAuthHeader() })
                ]);
                setSuppliers(suppliersRes.data);
                setProducts(productsRes.data);
                setPurchases(purchasesRes.data);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        loadData();
    }, [isOnline]);

    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prev, { ...product, quantity: 1, price: product.price || 0 }];
        });
        updateTotal(cart);
    };

    const removeFromCart = (id) => {
        setCart(prev => prev.filter(item => item.id !== id));
        updateTotal(cart);
    };

    const updateQuantity = (id, quantity) => {
        if (quantity <= 0) { removeFromCart(id); return; }
        setCart(prev => prev.map(item => item.id === id ? { ...item, quantity } : item));
        updateTotal(cart);
    };

    const updateTotal = (cartItems) => {
        const newTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setTotal(newTotal);
    };

    const handleCheckout = async () => {
        if (cart.length === 0 || !selectedSupplier) return;
        const purchaseData = {
            supplier_id: selectedSupplier,
            items: cart.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                price: item.price
            })),
            total: total
        };
        try {
            if (isOnline) {
                await axios.post(`${API_URL}/purchases`, purchaseData, { headers: getAuthHeader() });
            } else {
                await syncService.addToQueue('CREATE_PURCHASE', 'purchases', purchaseData);
            }
            alert('✅ Compra registrada correctamente');
            setCart([]);
            setTotal(0);
            setSelectedSupplier(null);
            // Recargar productos y compras
            const [productsRes, purchasesRes] = await Promise.all([
                axios.get(`${API_URL}/products`, { headers: getAuthHeader() }),
                axios.get(`${API_URL}/purchases`, { headers: getAuthHeader() })
            ]);
            setProducts(productsRes.data);
            setPurchases(purchasesRes.data);
            if (isOnline) {
                await db.products.bulkPut(productsRes.data);
            }
        } catch (err) { alert('Error al registrar compra'); }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><ShoppingBag size={24} /> Compras a Proveedores</h2>
                <button onClick={() => setShowCart(!showCart)} className="btn-primary">
                    <Plus size={18} /> {showCart ? 'Ver productos' : 'Ver carrito'}
                </button>
            </div>

            {!showCart ? (
                <>
                    <div className="card p-4 dark:bg-slate-800">
                        <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Proveedor</label>
                                <select value={selectedSupplier || ''} onChange={e => setSelectedSupplier(parseInt(e.target.value))} className="input-field">
                                    <option value="">Seleccionar proveedor...</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Buscar producto</label>
                                <input type="text" placeholder="Nombre o SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {filteredProducts.map(p => (
                            <div key={p.id} className="card p-3 hover:shadow-md transition cursor-pointer dark:bg-slate-800" onClick={() => addToCart(p)}>
                                <h3 className="font-medium text-slate-800 dark:text-white">{p.name}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Stock: {p.stock}</p>
                                <button className="mt-2 w-full btn-primary text-sm py-1" onClick={(e) => { e.stopPropagation(); addToCart(p); }}>
                                    Agregar
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="card p-4 dark:bg-slate-800">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Carrito de compras</h3>
                        {cart.length > 0 && <button onClick={() => { setCart([]); setTotal(0); }} className="text-red-500 text-sm">Vaciar</button>}
                    </div>
                    {cart.length === 0 ? (
                        <p className="text-slate-400 text-center py-8">No hay productos en el carrito</p>
                    ) : (
                        <>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {cart.map(item => (
                                    <div key={item.id} className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-800 dark:text-white">{item.name}</p>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">Precio compra: ${item.price}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">-</button>
                                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">+</button>
                                            <button onClick={() => removeFromCart(item.id)} className="text-red-500"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-slate-200 dark:border-slate-700 mt-4 pt-4">
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Total compra</span>
                                    <span className="text-green-600">${total.toFixed(2)}</span>
                                </div>
                                <button onClick={handleCheckout} className="btn-success w-full mt-4" disabled={!selectedSupplier || cart.length === 0}>
                                    <Save size={18} /> Registrar compra
                                </button>
                            </div>
                        </>
                    )}
                    <button onClick={() => setShowCart(false)} className="btn-outline w-full mt-2">Volver a productos</button>
                </div>
            )}

            {/* Historial de compras */}
            <div className="card overflow-hidden dark:bg-slate-800">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white p-4 border-b dark:border-slate-700">Historial de compras</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Proveedor</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Total</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                            {purchases.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">#{p.id}</td>
                                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{new Date(p.date).toLocaleString()}</td>
                                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{p.supplier_name || 'Proveedor eliminado'}</td>
                                    <td className="px-6 py-4 text-right font-semibold text-green-600 dark:text-green-400">${p.total.toFixed(2)}</td>
                                </tr>
                            ))}
                            {purchases.length === 0 && <tr><td colSpan="4" className="text-center py-8 text-slate-400 dark:text-slate-500">No hay compras registradas</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}