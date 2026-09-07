import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import { useTheme } from '@/context/ThemeContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { backgroundImageUrl } = useTheme();
  const location = useLocation();

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900 bg-cover bg-center bg-fixed"
      style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})` } : undefined}
    >
      {backgroundImageUrl && (
        <div className="fixed inset-0 bg-white/70 dark:bg-gray-900/80 z-0" />
      )}
      <div className="relative z-10 flex">
        <Sidebar />
        <div className="flex-1 lg:ml-64 transition-all duration-300 min-h-screen flex flex-col">
          <div className="relative">
            <div
              className="absolute top-0 left-0 right-0 h-px opacity-60"
              style={{
                background: `linear-gradient(90deg, transparent, rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.6), rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.3), transparent)`,
                boxShadow: `0 0 8px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.4)`,
              }}
            />
            <Header onMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
          </div>
          <main className="flex-1 p-4 lg:p-6 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;
