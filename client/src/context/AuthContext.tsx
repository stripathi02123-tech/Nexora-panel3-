import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';
import { User } from '@/types';

interface LoginResult {
  requires2FA: boolean;
  challengeUserId?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2FA: (userId: string, code: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => ({ requires2FA: false }),
  verify2FA: async () => {},
  register: async () => {},
  logout: () => {},
  updateUser: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('nexora_token');
    const savedUser = localStorage.getItem('nexora_user');
    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as User;
        setToken(savedToken);
        setUser(parsedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
      } catch {
        localStorage.removeItem('nexora_token');
        localStorage.removeItem('nexora_user');
      }
    }
    setIsLoading(false);
  }, []);

  const establishSession = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('nexora_token', newToken);
    localStorage.setItem('nexora_user', JSON.stringify(newUser));
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(newUser);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: newUser, requires2FA, challengeUserId } = res.data;

    if (requires2FA) {
      return { requires2FA: true, challengeUserId };
    }

    if (!newToken || !newUser) throw new Error('Login response was incomplete');
    establishSession(newToken, newUser);
    return { requires2FA: false };
  }, [establishSession]);

  const verify2FA = useCallback(async (userId: string, code: string) => {
    const res = await api.post('/auth/verify-2fa', { userId, token: code });
    const { token: newToken, user: newUser } = res.data;
    if (!newToken || !newUser) throw new Error('2FA response was incomplete');
    establishSession(newToken, newUser);
  }, [establishSession]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { name, email, password });
    const { token: newToken, user: newUser } = res.data;
    if (!newToken || !newUser) throw new Error('Registration response was incomplete');
    establishSession(newToken, newUser);
  }, [establishSession]);

  const logout = useCallback(() => {
    localStorage.removeItem('nexora_token');
    localStorage.removeItem('nexora_user');
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('nexora_user', JSON.stringify(updatedUser));
  }, []);

  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isAuthenticated, login, verify2FA, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
