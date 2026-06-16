import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { db } from '../services/Database';
import { syncService } from '../services/SyncService';
import { Search, Edit, Trash2, Plus, Save, X, DollarSign } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Products() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({
        name: '',
        price: 0,
        price_usd: 0,
        price_mlc: 0,
        stock: 0,
        min_stock: 5,
        sku: '',
        currency: 'CUP'
    });
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: '',
        price: 0,
        price_usd: 0,
        price_mlc: 0,
        stock: 0,
        min_stock: 5,
        sku: '',
        currency: 'CUP'
    });
    const { isOnline } = useApp();
    const { currencies, defaultCurrency, formatPrice, getCurrencySymbol } = useCurrency();

    const fetchProducts = async () => {
        try {
            const products = await db.products.toArray();
            setProducts(products);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProducts(); }, []);

    const handleEdit = (product) => {
        setEditingId(product.id);
        setEditForm({
            name: product.name,
            price: product.price || 0,
            price_usd: product.price_usd || 0,
            price_mlc: product.price_mlc || 0,
            stock: product.stock || 0,
            min_stock: product.min_stock || 5,
            sku: product.sku || '',
            currency: product.currency || 'CUP'
        });
    };

    const handleUpdate = async () => {
        try {
            await db.products.update(editingId, editForm);
            setEditingId(null);
            fetchProducts();
            if (isOnline) {
                await axios.put(`${API_URL}/products/${editingId}`, editForm, { headers: getAuthHeader() });
            } else {
                await syncService.addToQueue('UPDATE_PRODUCT', 'products', { id: editingId, ...editForm });
            }
        } catch (err) {
            alert('Error al actualizar');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar este producto?')) return;
        try {
            await db.products.delete(id);
            fetchProducts();
            if (isOnline) {
                await axios.delete(`${API_URL}/products/${id}`, { headers: getAuthHeader() });
            } else {
                await syncService.addToQueue('DELETE_PRODUCT', 'products', { id });
            }
        } catch (err) {
            alert('Error al eliminar');
        }
    };

    const handleCreate = async () => {
        if (!newProduct.name) return alert('El nombre es obligatorio');
        try {
            const productData = { ...newProduct };
            if (isOnline) {
                const res = await axios.post(`${API_URL}/products`, productData, { headers: getAuthHeader() });
                productData.id = res.data.id;
                await db.products.add(productData);
            } else {
                const id = Date.now();
                await db.products.add({ ...productData, id });
                await syncService.addToQueue('CREATE_PRODUCT', 'products', productData);
            }
            setShowCreateModal(false);
            setNewProduct({ name: '', price: 0, price_usd: 0, price_mlc: 0, stock: 0, min_stock: 5, sku: '', currency: 'CUP' });
            fetchProducts();
        } catch (err) {
            alert('Error al crear');
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const getStockBadge = (stock, minStock) => {
        if (stock === 0) return <span className="badge-stock badge-stock-out">Sin stock</span>;
        if (stock <= minStock) return <span className="badge-stock badge-stock-low">Stock bajo ({stock})</span>;
        return <span className="badge-stock badge-stock-high">Stock: {stock}</span>;
    };

    const getPriceDisplay = (product) => {
        const symbol = getCurrencySymbol(product.currency || 'CUP');
        return `${symbol}${product.price?.toFixed(2) || '0.00'}`;
    };

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Catálogo de Productos</h2>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary"><Plus size={18} /> Nuevo Producto</button>
            </div>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar por nombre o SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field pl-10" />
            </div>
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nombre</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Precio</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock Mín.</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">SKU</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredProducts.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    {editingId === p.id ? (
                                        <>
                                            <td className="px-4 py-2"><input className="input-field" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-1">
                                                    <select value={editForm.currency} onChange={e => setEditForm({ ...editForm, currency: e.target.value })} className="input-field w-20">
                                                        {currencies.map(c => <option key={c.id} value={c.code}>{c.code}</option>)}
                                                    </select>
                                                    <input type="number" step="0.01" className="input-field w-24" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: parseFloat(e.target.value) })} />
                                                </div>
                                            </td>
                                            <td className="px-4 py-2"><input type="number" className="input-field w-20" value={editForm.stock} onChange={e => setEditForm({ ...editForm, stock: parseInt(e.target.value) })} /></td>
                                            <td className="px-4 py-2"><input type="number" className="input-field w-20" value={editForm.min_stock} onChange={e => setEditForm({ ...editForm, min_stock: parseInt(e.target.value) })} /></td>
                                            <td className="px-4 py-2"><input className="input-field w-28" value={editForm.sku} onChange={e => setEditForm({ ...editForm, sku: e.target.value })} /></td>
                                            <td className="px-4 py-2 text-right">
                                                <button onClick={handleUpdate} className="text-green-600 hover:text-green-800 mr-2 transition-colors"><Save size={18} /></button>
                                                <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{p.name}</td>
                                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                                <div className="flex items-center gap-1">
                                                    <span>{getPriceDisplay(p)}</span>
                                                    <span className="text-xs text-slate-400">({p.currency || 'CUP'})</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">{getStockBadge(p.stock, p.min_stock)}</td>
                                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{p.min_stock || 5}</td>
                                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{p.sku || '-'}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 mr-3 transition-colors"><Edit size={18} /></button>
                                                <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700 transition-colors"><Trash2 size={18} /></button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl animate-slide-up">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">Nuevo Producto</h3>
                        <div className="space-y-3">
                            <input type="text" placeholder="Nombre *" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} className="input-field" />
                            <div className="flex items-center gap-2">
                                <select value={newProduct.currency} onChange={e => setNewProduct({ ...newProduct, currency: e.target.value })} className="input-field w-24">
                                    {currencies.map(c => <option key={c.id} value={c.code}>{c.code}</option>)}
                                </select>
                                <input type="number" step="0.01" placeholder="Precio" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) })} className="input-field flex-1" />
                            </div>
                            <input type="number" placeholder="Stock inicial" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: parseInt(e.target.value) })} className="input-field" />
                            <input type="number" placeholder="Stock mínimo" value={newProduct.min_stock} onChange={e => setNewProduct({ ...newProduct, min_stock: parseInt(e.target.value) })} className="input-field" />
                            <input type="text" placeholder="SKU" value={newProduct.sku} onChange={e => setNewProduct({ ...newProduct, sku: e.target.value })} className="input-field" />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowCreateModal(false)} className="btn-outline">Cancelar</button>
                            <button onClick={handleCreate} className="btn-primary">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}