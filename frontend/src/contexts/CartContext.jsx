import React, { createContext, useState, useContext } from 'react';
import { useCurrency } from './CurrencyContext';

const CartContext = createContext();
export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
    const [cart, setCart] = useState([]);
    const { defaultCurrency, convertPrice, formatPrice } = useCurrency();

    const addToCart = (product, currency = defaultCurrency?.code) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            // Convertir precio a la moneda seleccionada
            const priceInCurrency = currency ? convertPrice(product.price, 'CUP', currency) : product.price;
            return [...prev, {
                ...product,
                quantity: 1,
                currency: currency || defaultCurrency?.code || 'CUP',
                price: priceInCurrency,
                originalPrice: product.price,
                originalCurrency: 'CUP'
            }];
        });
    };

    const removeFromCart = (id) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id, quantity) => {
        if (quantity <= 0) {
            removeFromCart(id);
            return;
        }
        setCart(prev =>
            prev.map(item => (item.id === id ? { ...item, quantity } : item))
        );
    };

    const clearCart = () => setCart([]);

    const totalCart = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const getCartTotalInCurrency = (currencyCode) => {
        return cart.reduce((sum, item) => {
            const priceInTarget = convertPrice(item.price, item.currency || 'CUP', currencyCode);
            return sum + priceInTarget * item.quantity;
        }, 0);
    };

    return (
        <CartContext.Provider value={{
            cart,
            addToCart,
            removeFromCart,
            updateQuantity,
            clearCart,
            totalCart,
            getCartTotalInCurrency
        }}>
            {children}
        </CartContext.Provider>
    );
};