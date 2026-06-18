import axios from 'axios';
import { db } from './Database';
import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ========== HELPER PARA OBTENER TOKEN ==========
const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Servicio de sincronización offline-first
 * Maneja la sincronización de productos, clientes, ventas y transacciones
 * y la cola de acciones pendientes cuando no hay conexión
 */
class SyncService {
    constructor() {

        this.isOnline = navigator.onLine;
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
    }

    // ========== MANEJADORES DE CONEXIÓN ==========
    handleOnline() {
        this.isOnline = true;
        console.log('🟢 Conexión restablecida. Sincronizando...');
        this.syncAll();
    }

    handleOffline() {
        this.isOnline = false;
        console.log('🔴 Conexión perdida. Modo offline activado.');
    }

    // ========== SINCRONIZACIÓN COMPLETA ==========
    async syncAll() {
        if (!this.isOnline) {
            console.warn('⚠️ No hay conexión. La sincronización se realizará cuando vuelva la red.');
            return;
        }
        console.log('🔄 Iniciando sincronización completa...');
        try {
            await this.syncProducts();
            await this.syncCustomers();
            await this.syncSales();
            await this.syncTransactions(); // NUEVO: sincronizar transacciones
            await this.processSyncQueue();
            console.log('✅ Sincronización completada exitosamente');
        } catch (err) {
            console.error('❌ Error en sincronización completa:', err);
        }
    }

    // ========== SINCRONIZAR PRODUCTOS ==========
    async syncProducts() {
        try {
            const res = await axios.get(`${API_URL}/products`, { headers: getAuthHeader() });
            await db.products.bulkPut(res.data);
            console.log(`📦 Productos sincronizados: ${res.data.length}`);
        } catch (err) {
            console.error('Error sincronizando productos:', err);
        }
    }

    // ========== SINCRONIZAR CLIENTES ==========
    async syncCustomers() {
        try {
            const res = await axios.get(`${API_URL}/customers`, { headers: getAuthHeader() });
            await db.customers.bulkPut(res.data);
            console.log(`👥 Clientes sincronizados: ${res.data.length}`);
        } catch (err) {
            console.error('Error sincronizando clientes:', err);
        }
    }

    // ========== SINCRONIZAR VENTAS ==========
    async syncSales() {
        try {
            // 1. Enviar ventas locales no sincronizadas al backend
            const unsynced = await db.sales.where('synced').equals(0).toArray();
            for (const sale of unsynced) {
                const items = await db.saleItems.where('sale_id').equals(sale.id).toArray();
                const saleData = {
                    items: items.map(item => ({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        price: item.price,
                        currency: item.currency || 'CUP'
                    })),
                    total: sale.total,
                    customer_id: sale.customer_id,
                    currency: sale.currency || 'CUP',
                    payment_method: sale.payment_method || 'efectivo',
                    transaction_id: sale.transaction_id || '',
                    date: sale.date
                };
                await axios.post(`${API_URL}/sales`, saleData, { headers: getAuthHeader() });
                await db.sales.update(sale.id, { synced: 1 });
                console.log(`✅ Venta #${sale.id} sincronizada`);
            }

            // 2. Descargar ventas nuevas del backend (opcional)
            // Si quieres mantener todas las ventas en local, puedes hacer un GET y guardarlas.
            // Pero por ahora, solo enviamos las pendientes.
        } catch (err) {
            console.error('Error sincronizando ventas:', err);
        }
    }

    // ========== SINCRONIZAR TRANSACCIONES (CONTABILIDAD) ==========
    async syncTransactions() {
        try {
            // 1. Enviar transacciones locales no sincronizadas al backend
            const unsynced = await db.transactions.where('synced').equals(0).toArray();
            for (const tx of unsynced) {
                const txData = {
                    type: tx.type,
                    category: tx.category,
                    description: tx.description || '',
                    amount: tx.amount,
                    currency: tx.currency || 'CUP',
                    date: tx.date,
                    user_id: tx.user_id || null
                };
                // Si tiene ID, actualizar, si no, crear
                if (tx.id && tx.id > 0) {
                    await axios.put(`${API_URL}/transactions/${tx.id}`, txData, { headers: getAuthHeader() });
                } else {
                    const res = await axios.post(`${API_URL}/transactions`, txData, { headers: getAuthHeader() });
                    await db.transactions.update(tx.id, { id: res.data.id });
                }
                await db.transactions.update(tx.id, { synced: 1 });
                console.log(`✅ Transacción #${tx.id} sincronizada`);
            }

            // 2. Descargar transacciones nuevas del backend
            // Opcional: podrías sincronizar todas las transacciones, pero es mejor mantener solo locales.
        } catch (err) {
            console.error('Error sincronizando transacciones:', err);
        }
    }

    // ========== PROCESAR COLA DE SINCRONIZACIÓN ==========
    async processSyncQueue() {
        try {
            const queue = await db.syncQueue.toArray();
            if (queue.length === 0) return;

            console.log(`📤 Procesando ${queue.length} acciones pendientes...`);

            for (const item of queue) {
                try {
                    let response;
                    switch (item.action) {
                        // === Productos ===
                        case 'CREATE_PRODUCT':
                            response = await axios.post(`${API_URL}/products`, item.data, { headers: getAuthHeader() });
                            if (response.data.id) {
                                await db.products.update(response.data.id, { id: response.data.id });
                            }
                            break;

                        case 'UPDATE_PRODUCT':
                            await axios.put(`${API_URL}/products/${item.data.id}`, item.data, { headers: getAuthHeader() });
                            break;

                        case 'DELETE_PRODUCT':
                            await axios.delete(`${API_URL}/products/${item.data.id}`, { headers: getAuthHeader() });
                            await db.products.delete(item.data.id);
                            break;

                        // === Clientes ===
                        case 'CREATE_CUSTOMER':
                            response = await axios.post(`${API_URL}/customers`, item.data, { headers: getAuthHeader() });
                            if (response.data.id) {
                                await db.customers.update(response.data.id, { id: response.data.id });
                            }
                            break;

                        case 'UPDATE_CUSTOMER':
                            await axios.put(`${API_URL}/customers/${item.data.id}`, item.data, { headers: getAuthHeader() });
                            break;

                        case 'DELETE_CUSTOMER':
                            await axios.delete(`${API_URL}/customers/${item.data.id}`, { headers: getAuthHeader() });
                            await db.customers.delete(item.data.id);
                            break;

                        // === Ventas ===
                        case 'CREATE_SALE':
                            response = await axios.post(`${API_URL}/sales`, item.data, { headers: getAuthHeader() });
                            if (response.data.saleId) {
                                await db.sales.update(response.data.saleId, { id: response.data.saleId, synced: 1 });
                            }
                            break;

                        case 'UPDATE_SALE':
                            await axios.put(`${API_URL}/sales/${item.data.id}`, item.data, { headers: getAuthHeader() });
                            await db.sales.update(item.data.id, { synced: 1 });
                            break;

                        // === Transacciones (Contabilidad) ===
                        case 'CREATE_TRANSACTION':
                            response = await axios.post(`${API_URL}/transactions`, item.data, { headers: getAuthHeader() });
                            if (response.data.id) {
                                await db.transactions.update(response.data.id, { id: response.data.id, synced: 1 });
                            }
                            break;

                        case 'UPDATE_TRANSACTION':
                            await axios.put(`${API_URL}/transactions/${item.data.id}`, item.data, { headers: getAuthHeader() });
                            await db.transactions.update(item.data.id, { synced: 1 });
                            break;

                        case 'DELETE_TRANSACTION':
                            await axios.delete(`${API_URL}/transactions/${item.data.id}`, { headers: getAuthHeader() });
                            await db.transactions.delete(item.data.id);
                            break;

                        default:
                            console.warn(`⚠️ Acción desconocida: ${item.action}`);
                            continue;
                    }

                    await db.syncQueue.delete(item.id);
                    console.log(`✅ Acción "${item.action}" completada`);
                } catch (err) {
                    console.error(`❌ Error en acción "${item.action}":`, err);
                    // Si el error es 401 (token expirado), no eliminamos de la cola
                    if (err.response && err.response.status === 401) {
                        console.warn('🔐 Token expirado. Las acciones pendientes se reintentarán después del login.');
                        break;
                    }
                }
            }
        } catch (err) {
            console.error('❌ Error procesando cola de sincronización:', err);
        }
    }

    // ========== AÑADIR A LA COLA ==========
    async addToQueue(action, table, data) {
        await db.syncQueue.add({
            action,
            table,
            data,
            timestamp: new Date().toISOString()
        });
        // Si estamos online, intentar procesar inmediatamente
        if (this.isOnline) {
            await this.processSyncQueue();
        } else {
            console.log(`⏳ Acción "${action}" guardada en cola (offline)`);
        }
    }

    // ========== RESETEO Y LIMPIEZA ==========
    async clearQueue() {
        await db.syncQueue.clear();
        console.log('🧹 Cola de sincronización limpiada');
    }

    async resetSync() {
        // Marcar todas las tablas como no sincronizadas para forzar re-sync
        await db.sales.where('synced').equals(1).modify({ synced: 0 });
        await db.transactions.where('synced').equals(1).modify({ synced: 0 });
        console.log('🔄 Reseteo de sincronización completado');
    }
}

// Instancia única del servicio
export const syncService = new SyncService();