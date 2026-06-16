import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { db } from '../services/Database';
import { syncService } from '../services/SyncService';
import { useCart } from '../contexts/CartContext';
import { Trash2, Plus, Minus, CreditCard, ShoppingCart, User, Search, Wallet } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function POS() {
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saleStatus, setSaleStatus] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('CUP');
    const [paymentMethod, setPaymentMethod] = useState('efectivo');
    const [transactionId, setTransactionId] = useState('');
    const { cart, addToCart, removeFromCart, updateQuantity, clearCart, totalCart } = useCart();
    const { isOnline } = useApp();
    const { currencies, convertPrice, formatPrice, getCurrencySymbol, defaultCurrency, getRate } = useCurrency();

    useEffect(() => {
        if (defaultCurrency) setSelectedCurrency(defaultCurrency.code);
    }, [defaultCurrency]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [productsData, customersData] = await Promise.all([
                    db.products.toArray(),
                    db.customers.toArray()
                ]);
                setProducts(productsData);
                setCustomers(customersData);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
    );

    const getProductPriceInCurrency = (product) => {
        const productCurrency = product.currency || 'CUP';
        const priceInProductCurrency = product.price || 0;
        return convertPrice(priceInProductCurrency, productCurrency, selectedCurrency);
    };

    const handleAddToCart = (product) => {
        const priceInSelected = getProductPriceInCurrency(product);
        const productWithPrice = {
            ...product,
            price: priceInSelected,
            currency: selectedCurrency,
            originalPrice: product.price,
            originalCurrency: product.currency || 'CUP'
        };
        addToCart(productWithPrice);
    };

    // Cambiar moneda del carrito completo (opcional, para ventas mixtas)
    const handleCurrencyChange = (newCurrency) => {
        setSelectedCurrency(newCurrency);
        // Opcional: convertir todos los items del carrito a la nueva moneda
        // Por ahora, cada item mantiene su moneda original
    };

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        const totalInSelected = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const saleData = {
            items: cart.map(i => ({
                product_id: i.id,
                quantity: i.quantity,
                price: i.price,
                currency: i.currency || selectedCurrency
            })),
            total: totalInSelected,
            customer_id: selectedCustomer?.id || null,
            currency: selectedCurrency,
            payment_method: paymentMethod,
            transaction_id: transactionId || '',
            date: new Date().toISOString()
        };

        try {
            const tempId = Date.now();
            await db.sales.add({
                id: tempId,
                customer_id: saleData.customer_id,
                total: saleData.total,
                currency: saleData.currency,
                payment_method: saleData.payment_method,
                transaction_id: saleData.transaction_id,
                date: saleData.date,
                synced: 0
            });
            for (const item of saleData.items) {
                await db.saleItems.add({
                    id: Date.now() + Math.random(),
                    sale_id: tempId,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: item.price,
                    currency: item.currency
                });
            }

            for (const item of saleData.items) {
                const product = await db.products.get(item.product_id);
                if (product) {
                    await db.products.update(item.product_id, { stock: product.stock - item.quantity });
                }
            }

            if (isOnline) {
                await axios.post(`${API_URL}/sales`, saleData, { headers: getAuthHeader() });
                await db.sales.update(tempId, { synced: 1 });
                setSaleStatus(`✅ Venta registrada y sincronizada (${getPaymentMethodLabel(paymentMethod)})`);
            } else {
                await syncService.addToQueue('CREATE_SALE', 'sales', saleData);
                setSaleStatus(`✅ Venta guardada localmente (pendiente de sincronizar)`);
            }

            clearCart();
            setTransactionId('');
            const updatedProducts = await db.products.toArray();
            setProducts(updatedProducts);
            setTimeout(() => setSaleStatus(''), 5000);
        } catch (err) {
            setSaleStatus('❌ Error al procesar la venta');
            console.error(err);
        }
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card p-5 dark:bg-slate-800">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2"><ShoppingCart size={22} /> Productos</h3>
                <div className="mb-4 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar producto por nombre o SKU..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="input-field pl-10" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredProducts.map(p => {
                        const priceInSelected = getProductPriceInCurrency(p);
                        const symbol = getCurrencySymbol(selectedCurrency);
                        return (
                            <div key={p.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 hover:shadow-md transition-all duration-200 cursor-pointer bg-white dark:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-500 group" onClick={() => handleAddToCart(p)}>
                                <div className="aspect-square bg-gradient-to-br from-blue-50 to-slate-100 dark:from-blue-900/30 dark:to-slate-700 rounded-lg flex items-center justify-center mb-2 text-5xl group-hover:scale-110 transition-transform">📦</div>
                                <h4 className="font-medium text-slate-800 dark:text-white text-sm truncate">{p.name}</h4>
                                <p className="text-blue-700 dark:text-blue-400 font-bold mt-1">{symbol}{priceInSelected.toFixed(2)}</p>
                                <p className={`text-xs mt-1 ${p.stock === 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {p.stock === 0 ? 'Agotado' : `Stock: ${p.stock}`}
                                </p>
                                <button onClick={(e) => { e.stopPropagation(); handleAddToCart(p); }} disabled={p.stock === 0} className="mt-2 w-full bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white py-1.5 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                                    Agregar
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="card p-5 sticky top-4 self-start dark:bg-slate-800">
                <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><User size={16} /> Cliente</label>
                    <select value={selectedCustomer?.id || ''} onChange={e => { const id = parseInt(e.target.value); setSelectedCustomer(customers.find(c => c.id === id) || null); }} className="input-field">
                        <option value="">Cliente genérico</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name} - {c.phone || 'sin teléfono'}</option>)}
                    </select>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><CreditCard size={16} /> Moneda</label>
                    <select value={selectedCurrency} onChange={e => handleCurrencyChange(e.target.value)} className="input-field">
                        {currencies.filter(c => c.active !== false).map(c => (
                            <option key={c.id} value={c.code}>{c.code} - {c.symbol} (1 {c.code} = {c.exchange_rate} CUP)</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Tasa: 1 {selectedCurrency} = {getRate(selectedCurrency)} CUP
                    </p>
                </div>

                {/* Método de pago */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Wallet size={16} /> Método de pago</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input-field">
                        <option value="efectivo">💵 Efectivo</option>
                        <option value="transferencia">🏦 Transferencia bancaria</option>
                        <option value="transfermovil">📱 Transfermóvil</option>
                        <option value="tarjeta">💳 Tarjeta</option>
                        <option value="otro">🔄 Otro</option>
                    </select>
                </div>

                {/* Número de transacción (para Transfermóvil, Transferencia, etc.) */}
                {(paymentMethod === 'transferencia' || paymentMethod === 'transfermovil' || paymentMethod === 'tarjeta') && (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Número de transacción</label>
                        <input type="text" placeholder="Ej: T261660001DQ5" value={transactionId} onChange={e => setTransactionId(e.target.value)} className="input-field" />
                    </div>
                )}

                {selectedCustomer && (
                    <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-sm text-blue-800 dark:text-blue-300 flex items-center gap-2 border border-blue-100 dark:border-blue-800">
                        <User size={16} /> Cliente: <strong>{selectedCustomer.name}</strong> {selectedCustomer.phone && `- ${selectedCustomer.phone}`}
                    </div>
                )}

                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2"><CreditCard size={22} /> Carrito</h3>
                    {cart.length > 0 && <button onClick={clearCart} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center gap-1 transition-colors"><Trash2 size={16} /> Vaciar</button>}
                </div>
                {cart.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                        <ShoppingCart size={48} className="mx-auto mb-2 opacity-40" />
                        <p>No hay productos en el carrito</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                            {cart.map(item => {
                                const symbol = getCurrencySymbol(item.currency || selectedCurrency);
                                return (
                                    <div key={item.id} className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-800 dark:text-white">{item.name}</p>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">{symbol}{item.price.toFixed(2)} c/u</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center transition-colors"><Minus size={14} /></button>
                                            <span className="w-8 text-center font-medium text-slate-700 dark:text-white">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center transition-colors"><Plus size={14} /></button>
                                            <button onClick={() => removeFromCart(item.id)} className="ml-1 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="border-t border-slate-200 dark:border-slate-700 mt-4 pt-4">
                            <div className="flex justify-between text-lg font-bold">
                                <span className="text-slate-700 dark:text-slate-300">Total</span>
                                <span className="text-blue-700 dark:text-blue-400">{getCurrencySymbol(selectedCurrency)}{totalCart.toFixed(2)}</span>
                            </div>
                            <button onClick={handleCheckout} className="btn-success w-full mt-4"><CreditCard size={18} /> Cobrar</button>
                        </div>
                    </>
                )}
                {saleStatus && <div className={`mt-4 p-3 text-center rounded-lg ${saleStatus.includes('✅') ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>{saleStatus}</div>}
            </div>
        </div>
    );
}