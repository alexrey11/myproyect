import React from 'react';
import { useApp } from '../contexts/AppContext';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
    const { theme, toggleTheme } = useApp();
    return (
        <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
    );
}