import React, { createContext, useContext, useState, useEffect } from 'react';
import { BssApiClient } from '../api/bssApi';
import type { DecodedJwt, LoginRequest } from '../types';

interface AuthContextType {
  token: string | null;
  user: DecodedJwt | null;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  baseUrl: string;
  updateBaseUrl: (url: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(BssApiClient.getToken());
  const [user, setUser] = useState<DecodedJwt | null>(null);
  const [baseUrl, setBaseUrlState] = useState<string>(BssApiClient.getBaseUrl());

  useEffect(() => {
    if (token) {
      const decoded = BssApiClient.decodeJwt(token);
      setUser(decoded);
    } else {
      setUser(null);
    }
  }, [token]);

  const login = async (credentials: LoginRequest) => {
    const res = await BssApiClient.login(credentials);
    if (res.token) {
      setToken(res.token);
      const decoded = BssApiClient.decodeJwt(res.token);
      setUser(decoded);
    }
  };

  const logout = () => {
    BssApiClient.removeToken();
    setToken(null);
    setUser(null);
  };

  const updateBaseUrl = (url: string) => {
    BssApiClient.setBaseUrl(url);
    setBaseUrlState(url);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        login,
        logout,
        baseUrl,
        updateBaseUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
