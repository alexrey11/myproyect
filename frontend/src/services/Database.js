import Dexie from 'dexie';

export class Database extends Dexie {
    constructor() {
        super('TecoposDB');
        this.version(3).stores({
            products: 'id, name, sku, price, price_usd, price_mlc, stock, min_stock, currency',
            customers: 'id, name, email, phone, address',
            sales: 'id, customer_id, total, total_usd, total_mlc, currency, payment_method, transaction_id, date, synced',
            saleItems: 'id, sale_id, product_id, quantity, price, price_usd, price_mlc, currency',
            syncQueue: '++id, action, table, data, timestamp',
            currencies: '++id, code, name, symbol, exchange_rate, is_default, active'
        });
    }
}

export const db = new Database();

export const initCurrencies = async () => {
    const count = await db.currencies.count();
    if (count === 0) {
        await db.currencies.bulkAdd([
            { code: 'CUP', name: 'Peso Cubano', symbol: '$', exchange_rate: 1, is_default: true, active: true },
            { code: 'USD', name: 'Dólar Estadounidense', symbol: 'US$', exchange_rate: 24, is_default: false, active: true },
            { code: 'MLC', name: 'Moneda Libremente Convertible', symbol: 'MLC$', exchange_rate: 1, is_default: false, active: true }
        ]);
        console.log('✅ Monedas inicializadas');
    }
};