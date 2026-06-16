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

        if (navigator.onLine) {
            setSyncing(true);
            syncService.syncAll().finally(() => setSyncing(false));
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