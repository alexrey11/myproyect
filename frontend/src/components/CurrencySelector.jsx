import React from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { DollarSign, Euro, PoundSterling } from 'lucide-react';

const currencyIcons = {
    USD: DollarSign,
    EUR: Euro,
    GBP: PoundSterling,
    CUP: DollarSign, // usamos el mismo icono por simplicidad
    MLC: DollarSign,
};

export default function CurrencySelector() {
    const { currencies, activeCurrency, setActiveCurrency, convertPrice, getSymbol } = useCurrency();

    if (!currencies || currencies.length === 0) {
        return null;
    }

    const handleChange = (e) => {
        const newCode = e.target.value;
        const currency = currencies.find(c => c.code === newCode);
        if (currency) {
            setActiveCurrency(currency);
        }
    };

    const ActiveIcon = currencyIcons[activeCurrency?.code] || DollarSign;

    return (
        <div className="flex items-center gap-2 bg-white/90 rounded-lg px-3 py-1.5 border border-slate-200 shadow-sm">
            <ActiveIcon size={16} className="text-slate-500" />
            <select
                value={activeCurrency?.code || ''}
                onChange={handleChange}
                className="bg-transparent border-none text-sm font-medium text-slate-700 focus:outline-none focus:ring-0 cursor-pointer"
            >
                {currencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                        {currency.code} - {currency.name}
                    </option>
                ))}
            </select>
            <span className="text-xs text-slate-400 ml-1">
                {activeCurrency?.symbol || ''}
            </span>
        </div>
    );
}