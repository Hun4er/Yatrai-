import { useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';

/**
 * Custom React Hook to check and monitor API health status.
 */
export function useApiHealth() {
  const [state, setState] = useState({
    status: 'checking', // 'checking' | 'connected' | 'disconnected'
    data: null,
    error: null,
    lastChecked: null,
  });

  const checkHealth = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'checking', error: null }));
    try {
      const data = await api.health.check();
      setState({
        status: 'connected',
        data,
        error: null,
        lastChecked: new Date().toISOString(),
      });
    } catch (err) {
      setState({
        status: 'disconnected',
        data: null,
        error: err.message || 'API connection failed',
        lastChecked: new Date().toISOString(),
      });
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return {
    ...state,
    refetch: checkHealth,
  };
}

export default useApiHealth;
