import React, { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextType {
  dark: boolean;
  toggleDark: () => void;
  appName: string;
  setAppName: (name: string) => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  backgroundImageUrl: string;
  setBackgroundImageUrl: (url: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  dark: false,
  toggleDark: () => {},
  appName: 'Nexora Panel',
  setAppName: () => {},
  primaryColor: '#4f46e5',
  setPrimaryColor: () => {},
  backgroundImageUrl: '',
  setBackgroundImageUrl: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('nexora_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [appName, setAppNameState] = useState(() =>
    localStorage.getItem('nexora_app_name') || 'Nexora Panel'
  );

  const [primaryColor, setPrimaryColorState] = useState(() =>
    localStorage.getItem('nexora_primary_color') || '#4f46e5'
  );

  const [backgroundImageUrl, setBackgroundImageUrlState] = useState(() =>
    localStorage.getItem('nexora_bg_image') || ''
  );

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('nexora_theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('nexora_app_name', appName);
  }, [appName]);

  useEffect(() => {
    localStorage.setItem('nexora_primary_color', primaryColor);
    const root = document.documentElement;
    root.style.setProperty('--nexora-primary', primaryColor);
    // Parse hex to RGB for use in rgba() in CSS
    const hex = primaryColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    root.style.setProperty('--nexora-primary-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--neon-color', primaryColor);
  }, [primaryColor]);

  useEffect(() => {
    localStorage.setItem('nexora_bg_image', backgroundImageUrl);
  }, [backgroundImageUrl]);

  const toggleDark = () => setDark((prev) => !prev);
  const setAppName = (name: string) => setAppNameState(name);
  const setPrimaryColor = (color: string) => setPrimaryColorState(color);
  const setBackgroundImageUrl = (url: string) => setBackgroundImageUrlState(url);

  return (
    <ThemeContext.Provider value={{ dark, toggleDark, appName, setAppName, primaryColor, setPrimaryColor, backgroundImageUrl, setBackgroundImageUrl }}>
      {children}
    </ThemeContext.Provider>
  );
};
