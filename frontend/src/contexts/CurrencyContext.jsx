import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, initCurrencies } from '../services/Database';

const CurrencyContext = createContext();

export const useCurrency = () => useContext(CurrencyContext);

export const CurrencyProvider = ({ children }) => {
    const [currencies, setCurrencies] = useState([]);
    const [defaultCurrency, setDefaultCurrency] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exchangeRates, setExchangeRates] = useState({});

    useEffect(() => {
        const loadCurrencies = async () => {
            try {
                // Inicializar monedas si no existen
                await initCurrencies();

                // Cargar desde la base de datos
                const all = await db.currencies.toArray();

                if (all.length === 0) {
                    // Si no hay monedas, usar valores por defecto en memoria
                    const defaultData = [
                        { code: 'CUP', name: 'Peso Cubano', symbol: '$', exchange_rate: 1, is_default: 1, active: 1 },
                        { code: 'USD', name: 'Dólar Estadounidense', symbol: 'US$', exchange_rate: 24, is_default: 0, active: 1 },
                        { code: 'MLC', name: 'Moneda Libremente Convertible', symbol: 'MLC$', exchange_rate: 1, is_default: 0, active: 1 }
                    ];
                    setCurrencies(defaultData);
                    const defaultCurr = defaultData.find(c => c.is_default);
                    setDefaultCurrency(defaultCurr);
                    const rates = {};
                    defaultData.forEach(c => { rates[c.code] = c.exchange_rate; });
                    setExchangeRates(rates);
                    console.log('💰 Monedas cargadas desde memoria (fallback)');
                } else {
                    setCurrencies(all);
                    const defaultCurr = all.find(c => c.is_default);
                    setDefaultCurrency(defaultCurr);
                    const rates = {};
                    all.forEach(c => { rates[c.code] = c.exchange_rate; });
                    setExchangeRates(rates);
                    console.log('💰 Monedas cargadas desde la base de datos');
                }
            } catch (err) {
                console.error('❌ Error crítico al cargar monedas:', err);
                // Último recurso: valores por defecto en memoria
                const fallbackData = [
                    { code: 'CUP', name: 'Peso Cubano', symbol: '$', exchange_rate: 1, is_default: 1, active: 1 },
                    { code: 'USD', name: 'Dólar Estadounidense', symbol: 'US$', exchange_rate: 24, is_default: 0, active: 1 },
                    { code: 'MLC', name: 'Moneda Libremente Convertible', symbol: 'MLC$', exchange_rate: 1, is_default: 0, active: 1 }
                ];
                setCurrencies(fallbackData);
                const defaultCurr = fallbackData.find(c => c.is_default);
                setDefaultCurrency(defaultCurr);
                const rates = {};
                fallbackData.forEach(c => { rates[c.code] = c.exchange_rate; });
                setExchangeRates(rates);
                console.warn('⚠️ Usando monedas por defecto (fallback)');
            } finally {
                setLoading(false);
            }
        };

        loadCurrencies();
    }, []);

    // ========== FUNCIONES ==========

    const getCurrencySymbol = (code) => {
        const currency = currencies.find(c => c.code === code);
        return currency ? currency.symbol : '$';
    };

    // Fórmula CORRECTA de conversión
    const convertPrice = (amount, fromCurrency, toCurrency) => {
        if (fromCurrency === toCurrency) return amount;
        const fromRate = exchangeRates[fromCurrency] || 1;
        const toRate = exchangeRates[toCurrency] || 1;
        return (amount * fromRate) / toRate;
    };

    const formatPrice = (amount, currencyCode) => {
        const symbol = getCurrencySymbol(currencyCode);
        return `${symbol}${amount.toFixed(2)}`;
    };

    const getRate = (code) => {
        return exchangeRates[code] || 1;
    };

    // CRUD de monedas
    const addCurrency = async (currencyData) => {
        // Usamos 'code' como clave primaria
        await db.currencies.put(currencyData);
        const updated = await db.currencies.toArray();
        setCurrencies(updated);
        const rates = {};
        updated.forEach(c => { rates[c.code] = c.exchange_rate; });
        setExchangeRates(rates);
        return currencyData;
    };

    const updateCurrency = async (code, data) => {
        await db.currencies.update(code, data);
        const updated = await db.currencies.toArray();
        setCurrencies(updated);
        const rates = {};
        updated.forEach(c => { rates[c.code] = c.exchange_rate; });
        setExchangeRates(rates);
    };

    const setDefaultCurrencyById = async (code) => {
        // Desmarcar todos
        await db.currencies.where('is_default').equals(1).modify({ is_default: 0 });
        await db.currencies.update(code, { is_default: 1 });
        const updated = await db.currencies.toArray();
        setCurrencies(updated);
        const defaultCurr = updated.find(c => c.is_default);
        setDefaultCurrency(defaultCurr);
    };

    return (
        <CurrencyContext.Provider value={{
            currencies,
            defaultCurrency,
            loading,
            exchangeRates,
            getCurrencySymbol,
            convertPrice,
            formatPrice,
            getRate,
            addCurrency,
            updateCurrency,
            setDefaultCurrencyById
        }}>
            {children}
        </CurrencyContext.Provider>
    );
};