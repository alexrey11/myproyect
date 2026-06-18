import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/Database';

const WidgetContext = createContext();
export const useWidgets = () => useContext(WidgetContext);

const DEFAULT_WIDGETS = [
    { id: 'sales_today', label: 'Ventas de hoy', visible: true, icon: '📊' },
    { id: 'low_stock', label: 'Stock bajo', visible: true, icon: '⚠️' },
    { id: 'top_products', label: 'Productos más vendidos', visible: true, icon: '🏆' },
    { id: 'recent_sales', label: 'Ventas recientes', visible: true, icon: '🕐' },
];

export const WidgetProvider = ({ children }) => {
    const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
    const [loading, setLoading] = useState(true);

    // Cargar configuración desde Dexie
    useEffect(() => {
        const loadWidgets = async () => {
            try {
                // Intentar cargar desde la base de datos local
                const saved = await db.widgets?.toArray();
                if (saved && saved.length > 0) {
                    setWidgets(saved);
                } else {
                    // Si no hay configurada, guardar la predeterminada
                    await db.widgets?.bulkPut(DEFAULT_WIDGETS);
                }
            } catch (err) {
                console.warn('No se pudo cargar configuración de widgets, usando defaults:', err);
            } finally {
                setLoading(false);
            }
        };
        loadWidgets();
    }, []);

    const toggleWidget = async (id) => {
        const newWidgets = widgets.map(w =>
            w.id === id ? { ...w, visible: !w.visible } : w
        );
        setWidgets(newWidgets);
        // Guardar en Dexie (si existe la tabla)
        try {
            await db.widgets?.bulkPut(newWidgets);
        } catch (err) {
            console.warn('No se pudo guardar configuración de widgets:', err);
        }
    };

    const resetWidgets = async () => {
        setWidgets(DEFAULT_WIDGETS);
        try {
            await db.widgets?.bulkPut(DEFAULT_WIDGETS);
        } catch (err) {
            console.warn('No se pudo resetear configuración de widgets:', err);
        }
    };

    return (
        <WidgetContext.Provider value={{ widgets, loading, toggleWidget, resetWidgets }}>
            {children}
        </WidgetContext.Provider>
    );
};