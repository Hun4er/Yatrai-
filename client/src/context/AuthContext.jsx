import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Auth state: 'loading' | 'authenticated' | 'unauthenticated'
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Session Restoration on Application Startup
   * Attempts to exchange existing HTTP-only refresh cookie for a fresh access token and user identity.
   */
  const restoreSession = useCallback(async () => {
    setStatus('loading');
    try {
      const refreshResult = await api.auth.refresh();
      if (refreshResult?.data?.accessToken) {
        setAccessToken(refreshResult.data.accessToken);

        // Fetch current user details via protected /me endpoint to ensure valid session
        const meResult = await api.auth.me();
        setUser(meResult.data.user);
        setStatus('authenticated');
      } else {
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
      }
    } catch {
      // No active session or revoked cookie
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  /**
   * Register a new user
   */
  const register = async (name, email, password) => {
    setStatus('loading');
    setError(null);
    try {
      const res = await api.auth.register(name, email, password);
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      setStatus('authenticated');
      return { success: true, user: res.data.user };
    } catch (err) {
      setError(err.message || 'Registration failed');
      setStatus('unauthenticated');
      return { success: false, error: err.message };
    }
  };

  /**
   * Log in an existing user
   */
  const login = async (email, password) => {
    setStatus('loading');
    setError(null);
    try {
      const res = await api.auth.login(email, password);
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      setStatus('authenticated');
      return { success: true, user: res.data.user };
    } catch (err) {
      setError(err.message || 'Login failed');
      setStatus('unauthenticated');
      return { success: false, error: err.message };
    }
  };

  /**
   * Log out current user
   */
  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Clear local state regardless of server logout result
    } finally {
      setAccessToken(null);
      setUser(null);
      setError(null);
      setStatus('unauthenticated');
    }
  };

  const clearError = () => setError(null);

  const value = {
    status,
    user,
    error,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    register,
    login,
    logout,
    clearError,
    refreshUser: restoreSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
