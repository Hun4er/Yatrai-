import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api, { setAccessToken, setOnSessionExpired } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Auth state: 'loading' | 'authenticated' | 'unauthenticated'
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Listen for background session expirations triggered by the API client
   */
  useEffect(() => {
    setOnSessionExpired((message) => {
      if (!isMountedRef.current) return;
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
      setError(message || 'Your session has expired. Please sign in again.');
    });
  }, []);

  /**
   * Session Restoration on Application Startup
   * Attempts to exchange existing HTTP-only refresh cookie for a fresh access token and user identity.
   */
  const restoreSession = useCallback(async () => {
    if (!isMountedRef.current) return;
    setStatus('loading');

    try {
      const refreshResult = await api.auth.refresh(true);
      if (refreshResult?.data?.accessToken) {
        setAccessToken(refreshResult.data.accessToken);

        // If refresh endpoint returns the user profile directly, use it
        if (refreshResult.data.user) {
          if (isMountedRef.current) {
            setUser(refreshResult.data.user);
            setStatus('authenticated');
            setError(null);
          }
        } else {
          // Fallback to protected /me endpoint to verify authorization
          const meResult = await api.auth.me();
          if (isMountedRef.current) {
            setUser(meResult.data.user);
            setStatus('authenticated');
            setError(null);
          }
        }
      } else {
        if (isMountedRef.current) {
          setAccessToken(null);
          setUser(null);
          setStatus('unauthenticated');
        }
      }
    } catch {
      if (isMountedRef.current) {
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
      }
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
      const message = err.message || 'Registration failed';
      setError(message);
      setStatus('unauthenticated');
      return { success: false, error: message, code: err.code };
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
      const message = err.message || 'Invalid email or password';
      setError(message);
      setStatus('unauthenticated');
      return { success: false, error: message, code: err.code };
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
    signup: register,
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
