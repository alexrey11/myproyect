import React, { createContext, useContext, useEffect, useState } from 'react';
import { syncService } from '../services/SyncService';

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setSyncing(true);
            syncService.syncAll().finally(() => setSyncing(false));
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Solo sincronizar al inicio si estamos online
        if (navigator.onLine) {
            setSyncing(true);
            syncService.syncAll().finally(() => setSyncing(false));
        } else {
            console.log('⏳ Modo offline: no se sincronizará al inicio.');
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return (
        <AppContext.Provider value={{ isOnline, syncing }}>
            {children}
        </AppContext.Provider>
    );
};