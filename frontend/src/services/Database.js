import Dexie from 'dexie';

/**
 * Base de datos local (IndexedDB) para Gestión Pro
 * Usa Dexie.js para facilitar el acceso y la sincronización offline
 */
export class Database extends Dexie {
    constructor() {
        super('GestionProDB');

        // VERSIÓN 5: Estructura mejorada
        this.version(5).stores({
            // Tablas principales
            products: 'id, name, sku, price, stock, min_stock, currency',
            customers: 'id, name, email, phone, address',
            sales: 'id, customer_id, total, currency, payment_method, transaction_id, date, synced',
            saleItems: 'id, sale_id, product_id, quantity, price, currency',

            // Sincronización
            syncQueue: '++id, action, table, data, timestamp',

            // Configuración (usamos 'code' como clave primaria)
            currencies: 'code, name, symbol, exchange_rate, is_default, active',

            // Contabilidad
            transactions: 'id, type, category, description, amount, currency, date, user_id, synced'
        });
    }
}

// Instancia única de la base de datos
export const db = new Database();

// ========== FUNCIONES DE INICIALIZACIÓN ==========

/**
 * Inicializa las monedas predeterminadas (CUP, USD, MLC)
 * Usa 'code' como clave primaria, evitando conflictos con 'id'.
 */
export const initCurrencies = async () => {
    try {
        const count = await db.currencies.count();
        if (count === 0) {
            await db.currencies.bulkPut([
                { code: 'CUP', name: 'Peso Cubano', symbol: '$', exchange_rate: 1, is_default: 1, active: 1 },
                { code: 'USD', name: 'Dólar Estadounidense', symbol: 'US$', exchange_rate: 24, is_default: 0, active: 1 },
                { code: 'MLC', name: 'Moneda Libremente Convertible', symbol: 'MLC$', exchange_rate: 1, is_default: 0, active: 1 }
            ]);
            console.log('✅ Monedas predeterminadas inicializadas correctamente');
        } else {
            console.log(`ℹ️ Ya existen ${count} monedas en la base de datos`);
        }
    } catch (err) {
        console.error('❌ Error al inicializar monedas:', err);
        // Si falla, intentar limpiar y reintentar
        try {
            await db.currencies.clear();
            await db.currencies.bulkPut([
                { code: 'CUP', name: 'Peso Cubano', symbol: '$', exchange_rate: 1, is_default: 1, active: 1 },
                { code: 'USD', name: 'Dólar Estadounidense', symbol: 'US$', exchange_rate: 24, is_default: 0, active: 1 },
                { code: 'MLC', name: 'Moneda Libremente Convertible', symbol: 'MLC$', exchange_rate: 1, is_default: 0, active: 1 }
            ]);
            console.log('✅ Monedas reinicializadas correctamente');
        } catch (e) {
            console.error('❌ Error crítico al reinicializar monedas:', e);
        }
    }
};

/**
 * Verifica que todas las tablas necesarias existan.
 * Útil para migraciones o reparaciones.
 */
export const ensureTables = async () => {
    try {
        await db.open();
        console.log('✅ Base de datos local abierta correctamente');
    } catch (err) {
        console.error('❌ Error al abrir la base de datos:', err);
        throw err;
    }
};

// ========== FUNCIONES DE UTILIDAD ==========

/**
 * Guarda una transacción en la base de datos local.
 * @param {Object} transaction - Datos de la transacción
 * @param {string} transaction.type - 'income' o 'expense'
 * @param {string} transaction.category - Categoría
 * @param {string} transaction.description - Descripción opcional
 * @param {number} transaction.amount - Monto
 * @param {string} transaction.currency - Moneda (CUP, USD, MLC)
 * @param {string} transaction.date - Fecha en formato ISO
 * @param {number} transaction.user_id - ID del usuario (opcional)
 * @param {number} transaction.synced - 0 = pendiente, 1 = sincronizado
 * @returns {Promise<number>} ID de la transacción guardada
 */
export const saveTransaction = async (transaction) => {
    return await db.transactions.add({
        ...transaction,
        synced: transaction.synced !== undefined ? transaction.synced : 0
    });
};

/**
 * Obtiene todas las transacciones de un usuario (o las no asignadas).
 * @param {number} userId - ID del usuario (opcional)
 * @param {Object} filters - Filtros (start, end, type, category)
 * @returns {Promise<Array>} Lista de transacciones
 */
export const getTransactions = async (userId = null, filters = {}) => {
    let collection = db.transactions;
    let query = collection;

    if (userId !== null) {
        query = query.where('user_id').equals(userId);
    } else {
        query = query.where('user_id').equals(null);
    }

    // Aplicar filtros de fecha
    if (filters.start && filters.end) {
        query = query.and(tx => tx.date >= filters.start && tx.date <= filters.end);
    } else if (filters.start) {
        query = query.and(tx => tx.date >= filters.start);
    } else if (filters.end) {
        query = query.and(tx => tx.date <= filters.end);
    }

    if (filters.type) {
        query = query.and(tx => tx.type === filters.type);
    }

    if (filters.category) {
        query = query.and(tx => tx.category === filters.category);
    }

    return await query.reverse().sortBy('date');
};

/**
 * Obtiene el resumen financiero (ingresos, gastos, balance)
 * @param {number} userId - ID del usuario (opcional)
 * @param {Object} filters - Filtros (start, end)
 * @returns {Promise<Object>} { income, expense, balance }
 */
export const getFinancialSummary = async (userId = null, filters = {}) => {
    const transactions = await getTransactions(userId, filters);
    let income = 0, expense = 0;
    transactions.forEach(tx => {
        if (tx.type === 'income') income += tx.amount;
        else if (tx.type === 'expense') expense += tx.amount;
    });
    return { income, expense, balance: income - expense };
};

// ========== EXPORTACIÓN POR DEFECTO ==========
export default db;