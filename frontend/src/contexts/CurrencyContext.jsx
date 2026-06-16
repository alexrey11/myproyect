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
                await initCurrencies();
                const all = await db.currencies.toArray();
                setCurrencies(all);
                const defaultCurr = all.find(c => c.is_default);
                setDefaultCurrency(defaultCurr);
                const rates = {};
                all.forEach(c => {
                    rates[c.code] = c.exchange_rate;
                });
                setExchangeRates(rates);
            } catch (err) {
                console.error('Error cargando monedas:', err);
            } finally {
                setLoading(false);
            }
        };
        loadCurrencies();
    }, []);

    const getCurrencySymbol = (code) => {
        const currency = currencies.find(c => c.code === code);
        return currency ? currency.symbol : '$';
    };

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

    const addCurrency = async (currencyData) => {
        const id = await db.currencies.add(currencyData);
        const newCurrency = { ...currencyData, id };
        setCurrencies(prev => [...prev, newCurrency]);
        setExchangeRates(prev => ({
            ...prev,
            [currencyData.code]: currencyData.exchange_rate
        }));
        return newCurrency;
    };

    const updateCurrency = async (id, data) => {
        await db.currencies.update(id, data);
        setCurrencies(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
        if (data.exchange_rate) {
            setExchangeRates(prev => ({
                ...prev,
                [data.code || prev.code]: data.exchange_rate
            }));
        }
    };

    const setDefaultCurrencyById = async (id) => {
        await db.currencies.where('is_default').equals(true).modify({ is_default: false });
        await db.currencies.update(id, { is_default: true });
        setCurrencies(prev => prev.map(c => ({ ...c, is_default: c.id === id })));
        const newDefault = currencies.find(c => c.id === id);
        setDefaultCurrency(newDefault);
    };

    const getRate = (code) => {
        return exchangeRates[code] || 1;
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
            addCurrency,
            updateCurrency,
            setDefaultCurrencyById,
            getRate
        }}>
            {children}
        </CurrencyContext.Provider>
    );
};