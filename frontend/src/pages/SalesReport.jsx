import React, { useEffect, useState, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { db } from '../services/Database';
import { syncService } from '../services/SyncService';
import { FileText, User, Calendar, DollarSign, Download, Filter, Edit, Save, X, Printer, FileDown } from 'lucide-react';
import axios from 'axios';
import { useReactToPrint } from 'react-to-print';
import Ticket from '../components/Ticket';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
    const [ticketData, setTicketData] = useState(null);
    const [showTicketModal, setShowTicketModal] = useState(false);
    const ticketRef = useRef();
    const pdfRef = useRef();
    const { isOnline } = useApp();
    const { getCurrencySymbol } = useCurrency();

    // ========== IMPRESIÓN DE TICKET ==========
    const handlePrint = useReactToPrint({
        contentRef: ticketRef,
        pageStyle: '@page { margin: 0; }',
        onAfterPrint: () => setShowTicketModal(false),
        onPrintError: (error) => {
            console.error('Error al imprimir:', error);
            alert('Error al imprimir. Intenta de nuevo.');
        }
    });

    // ========== EXPORTACIÓN A PDF ==========
    const exportPDF = async () => {
        const input = pdfRef.current;
        if (!input) return;
        try {
            const canvas = await html2canvas(input, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            pdf.save('reporte-ventas.pdf');
        } catch (err) {
            console.error('Error generando PDF:', err);
            alert('Error al generar el PDF');
        }
    };

    // ========== OBTENER VENTAS ==========
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
                        items
                    };
                }));
                setSales(salesWithDetails);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSales(); }, []);

    // ========== FILTROS ==========
    const handleFilter = () => { fetchSales(startDate, endDate); setFilterApplied(true); };
    const clearFilter = () => { setStartDate(''); setEndDate(''); fetchSales(); setFilterApplied(false); };

    // ========== CALCULAR TOTALES POR MONEDA ==========
    const calculateTotals = () => {
        const totals = {};
        sales.forEach(sale => {
            const currency = sale.currency || 'CUP';
            totals[currency] = (totals[currency] || 0) + (sale.total || 0);
        });
        return totals;
    };
    const totals = calculateTotals();

    // ========== EXPORTAR CSV ==========
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
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'ventas.csv';
        link.click();
    };

    // ========== IMPRIMIR TICKET ==========
    const printTicket = async (saleId) => {
        try {
            let saleData;
            if (isOnline) {
                const res = await axios.get(`${API_URL}/sales/${saleId}/ticket`, { headers: getAuthHeader() });
                saleData = res.data;
            } else {
                const sale = await db.sales.get(saleId);
                if (!sale) {
                    alert('Venta no encontrada localmente');
                    return;
                }
                const items = await db.saleItems.where('sale_id').equals(saleId).toArray();
                const customer = sale.customer_id ? await db.customers.get(sale.customer_id) : null;
                saleData = {
                    id: sale.id,
                    date: sale.date,
                    total: sale.total,
                    currency: sale.currency || 'CUP',
                    payment_method: sale.payment_method || 'efectivo',
                    transaction_id: sale.transaction_id || '',
                    customer_name: customer ? customer.name : 'Cliente genérico',
                    customer_phone: customer ? customer.phone : '',
                    items: items.map(item => ({
                        product_name: item.product_name || 'Producto',
                        quantity: item.quantity,
                        price: item.price
                    }))
                };
            }
            setTicketData(saleData);
            setShowTicketModal(true);
            setTimeout(() => handlePrint(), 500);
        } catch (err) {
            alert('Error al cargar ticket');
            console.error(err);
        }
    };

    // ========== EDITAR VENTA ==========
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

    // ========== UTILIDADES ==========
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
            {/* Cabecera con botones de exportación */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <FileText size={24} /> Reporte de Ventas
                </h2>
                <div className="flex flex-wrap gap-2">
                    <button onClick={exportCSV} className="btn-primary bg-green-600 hover:bg-green-700 text-sm sm:text-base">
                        <Download size={18} /> CSV
                    </button>
                    <button onClick={exportPDF} className="btn-primary bg-red-600 hover:bg-red-700 text-sm sm:text-base">
                        <FileDown size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="card p-4 dark:bg-slate-800">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 sm:flex-none">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Desde</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field w-full sm:w-auto" />
                    </div>
                    <div className="flex-1 sm:flex-none">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hasta</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field w-full sm:w-auto" />
                    </div>
                    <button onClick={handleFilter} className="btn-primary"><Filter size={18} /> Filtrar</button>
                    {filterApplied && <button onClick={clearFilter} className="btn-outline">Limpiar</button>}
                </div>
            </div>

            {/* Totales por moneda */}
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

            {/* Tabla para exportar a PDF (oculta, solo para el PDF) */}
            <div ref={pdfRef} className="hidden">
                <div className="p-8 bg-white">
                    <h2 className="text-2xl font-bold text-center mb-4">Reporte de Ventas</h2>
                    {startDate && endDate && <p className="text-center text-sm text-gray-500 mb-4">Desde {startDate} hasta {endDate}</p>}
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border p-2 text-left">ID</th>
                                <th className="border p-2 text-left">Fecha</th>
                                <th className="border p-2 text-left">Cliente</th>
                                <th className="border p-2 text-left">Moneda</th>
                                <th className="border p-2 text-left">Método</th>
                                <th className="border p-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sales.map(s => (
                                <tr key={s.id}>
                                    <td className="border p-2">#{s.id}</td>
                                    <td className="border p-2">{new Date(s.date).toLocaleString()}</td>
                                    <td className="border p-2">{s.customer_name || 'Genérico'}</td>
                                    <td className="border p-2">{s.currency || 'CUP'}</td>
                                    <td className="border p-2">{getPaymentMethodLabel(s.payment_method)}</td>
                                    <td className="border p-2 text-right font-semibold">{getTotalDisplay(s)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="mt-4 text-right font-bold">
                        Total general: {Object.entries(totals).map(([currency, total]) => `${currency}: ${getCurrencySymbol(currency)}${total.toFixed(2)}`).join(' | ')}
                    </div>
                </div>
            </div>

            {/* Tabla principal (escritorio) */}
            <div className="hidden md:block card overflow-hidden dark:bg-slate-800">
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
                                                <button onClick={() => printTicket(s.id)} className="text-purple-600 hover:text-purple-800 mr-2" title="Imprimir ticket"><Printer size={16} /></button>
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

            {/* Vista móvil (tarjetas) */}
            <div className="md:hidden space-y-4">
                {sales.map(s => (
                    <div key={s.id} className="card p-4 dark:bg-slate-800">
                        {editingSale === s.id ? (
                            <div className="space-y-2">
                                <div>
                                    <label className="block text-xs text-slate-500 dark:text-slate-400">Total</label>
                                    <input type="number" step="0.01" value={editForm.total} onChange={e => setEditForm({ ...editForm, total: parseFloat(e.target.value) })} className="input-field text-sm py-1" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 dark:text-slate-400">Método</label>
                                    <select value={editForm.payment_method} onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })} className="input-field text-sm py-1">
                                        <option value="efectivo">Efectivo</option>
                                        <option value="transferencia">Transferencia</option>
                                        <option value="transfermovil">Transfermóvil</option>
                                        <option value="tarjeta">Tarjeta</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 dark:text-slate-400">Transacción</label>
                                    <input type="text" placeholder="Nro. transacción" value={editForm.transaction_id} onChange={e => setEditForm({ ...editForm, transaction_id: e.target.value })} className="input-field text-sm py-1" />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={handleSaveEdit} className="btn-primary flex-1 text-sm py-1"><Save size={16} /> Guardar</button>
                                    <button onClick={() => setEditingSale(null)} className="btn-outline flex-1 text-sm py-1">Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-500 dark:text-slate-400"><Calendar size={12} className="inline mr-1" />{new Date(s.date).toLocaleString()}</p>
                                        <p className="font-medium text-slate-800 dark:text-white">{s.customer_name || 'Genérico'}</p>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className="text-sm font-bold text-green-600 dark:text-green-400">{getTotalDisplay(s)}</span>
                                            <span className="text-xs text-slate-400">{s.currency || 'CUP'}</span>
                                            <span className="text-xs text-slate-400">{getPaymentMethodLabel(s.payment_method)}</span>
                                            {s.transaction_id && <span className="text-xs text-slate-400">ID: {s.transaction_id}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => printTicket(s.id)} className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"><Printer size={16} /></button>
                                        <button onClick={() => handleEditSale(s)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"><Edit size={16} /></button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ))}
                {!sales.length && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500">No hay ventas registradas</div>
                )}
            </div>

            {/* Modal de ticket */}
            {showTicketModal && ticketData && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 max-w-sm w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-end mb-2">
                            <button onClick={() => setShowTicketModal(false)} className="text-gray-500 hover:text-gray-700">
                                <X size={20} />
                            </button>
                        </div>
                        <Ticket ref={ticketRef} sale={ticketData} storeName="Gestión Pro" storePhone="555-0000" />
                    </div>
                </div>
            )}
        </div>
    );
}