import axios from 'axios';
import { db } from './Database';

const API_URL = 'http://localhost:3001/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

class SyncService {
    constructor() {
        this.isOnline = navigator.onLine;
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
    }

    handleOnline() {
        this.isOnline = true;
        this.syncAll();
    }

    handleOffline() {
        this.isOnline = false;
    }

    async syncAll() {
        if (!this.isOnline) return;
        console.log('🔄 Sincronizando datos...');
        try {
            await this.syncProducts();
            await this.syncCustomers();
            await this.syncSales();
            await this.processSyncQueue();
            console.log('✅ Sincronización completada');
        } catch (err) {
            console.error('Error en syncAll:', err);
        }
    }

    async syncProducts() {
        try {
            const res = await axios.get(`${API_URL}/products`, { headers: getAuthHeader() });
            await db.products.bulkPut(res.data);
            console.log('📦 Productos sincronizados');
        } catch (err) {
            console.error('Error sync products:', err);
        }
    }

    async syncCustomers() {
        try {
            const res = await axios.get(`${API_URL}/customers`, { headers: getAuthHeader() });
            await db.customers.bulkPut(res.data);
            console.log('👥 Clientes sincronizados');
        } catch (err) {
            console.error('Error sync customers:', err);
        }
    }

    async syncSales() {
        try {
            const unsynced = await db.sales.where('synced').equals(0).toArray();
            for (const sale of unsynced) {
                const items = await db.saleItems.where('sale_id').equals(sale.id).toArray();
                const saleData = {
                    items: items.map(item => ({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        price: item.price
                    })),
                    total: sale.total,
                    customer_id: sale.customer_id,
                    currency: sale.currency || 'CUP'
                };
                await axios.post(`${API_URL}/sales`, saleData, { headers: getAuthHeader() });
                await db.sales.update(sale.id, { synced: 1 });
                // Actualizar stock local
                for (const item of saleData.items) {
                    const product = await db.products.get(item.product_id);
                    if (product) {
                        await db.products.update(item.product_id, { stock: product.stock - item.quantity });
                    }
                }
                console.log(`✅ Venta ${sale.id} sincronizada`);
            }
        } catch (err) {
            console.error('Error sync sales:', err);
        }
    }

    async processSyncQueue() {
        const queue = await db.syncQueue.toArray();
        for (const item of queue) {
            try {
                if (item.action === 'CREATE_CUSTOMER') {
                    await axios.post(`${API_URL}/customers`, item.data, { headers: getAuthHeader() });
                } else if (item.action === 'CREATE_PRODUCT') {
                    await axios.post(`${API_URL}/products`, item.data, { headers: getAuthHeader() });
                } else if (item.action === 'CREATE_SALE') {
                    await axios.post(`${API_URL}/sales`, item.data, { headers: getAuthHeader() });
                } else if (item.action === 'UPDATE_PRODUCT') {
                    await axios.put(`${API_URL}/products/${item.data.id}`, item.data, { headers: getAuthHeader() });
                } else if (item.action === 'DELETE_PRODUCT') {
                    await axios.delete(`${API_URL}/products/${item.data.id}`, { headers: getAuthHeader() });
                }
                await db.syncQueue.delete(item.id);
                console.log(`✅ Acción ${item.action} sincronizada`);
            } catch (err) {
                console.error(`Error sincronizando acción ${item.action}:`, err);
            }
        }
    }

    async addToQueue(action, table, data) {
        await db.syncQueue.add({
            action,
            table,
            data,
            timestamp: new Date().toISOString()
        });
        if (this.isOnline) {
            await this.processSyncQueue();
        }
    }
}

export const syncService = new SyncService();