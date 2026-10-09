import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Helper to measure fetch latency with timeout
 */
async function pingUrl(url, options = {}, timeoutMs = 3000) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    return { ok: res.ok, status: res.status, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return { ok: false, status: 0, latencyMs, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

export class ProviderHealthService {
  /**
   * Checks real-time health of all transport and geocoding providers.
   *
   * @returns {Promise<Object>}
   */
  async checkAll() {
    const checkedAt = new Date().toISOString();

    const [railHealth, roadHealth, flightHealth, busHealth, geocodingHealth] = await Promise.all([
      this.checkRail(),
      this.checkRoad(),
      this.checkFlight(),
      this.checkBus(),
      this.checkGeocoding(),
    ]);

    const providers = [railHealth, roadHealth, flightHealth, busHealth, geocodingHealth];
    const operationalCount = providers.filter((p) => p.status === 'healthy').length;

    const overallStatus =
      railHealth.status === 'healthy' && roadHealth.status === 'healthy'
        ? 'healthy'
        : operationalCount > 0
          ? 'degraded'
          : 'down';

    return {
      status: overallStatus,
      checkedAt,
      operationalProviders: operationalCount,
      totalProviders: providers.length,
      providers,
    };
  }

  async checkRail() {
    const { enabled, apiUrl, apiKey, timeoutMs } = config.providers.rail;
    if (!enabled) {
      return {
        mode: 'rail',
        provider: 'Indian Railways (RailRadar)',
        enabled: false,
        configured: false,
        status: 'disabled',
        message: 'Rail provider is disabled in configuration',
      };
    }

    if (!apiUrl || !apiKey) {
      return {
        mode: 'rail',
        provider: 'Indian Railways (RailRadar)',
        enabled: true,
        configured: false,
        status: 'unavailable',
        message: 'RAIL_API_KEY or RAIL_API_URL not configured',
      };
    }

    const testUrl = `${apiUrl.replace(/\/$/, '')}/trains/between/NDLS/BPL`;
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
      'X-API-Key': apiKey.trim(),
    };

    const res = await pingUrl(testUrl, { headers }, Math.min(timeoutMs || 4000, 4000));
    if (res.ok) {
      return {
        mode: 'rail',
        provider: 'Indian Railways (RailRadar)',
        enabled: true,
        configured: true,
        status: 'healthy',
        latencyMs: res.latencyMs,
        bookable: true,
      };
    }

    return {
      mode: 'rail',
      provider: 'Indian Railways (RailRadar)',
      enabled: true,
      configured: true,
      status: res.status === 401 || res.status === 403 ? 'unauthorized' : 'degraded',
      latencyMs: res.latencyMs,
      error: res.error || `HTTP ${res.status}`,
    };
  }

  async checkRoad() {
    const { enabled, apiUrl, timeoutMs } = config.providers.road;
    if (!enabled) {
      return {
        mode: 'road',
        provider: 'Road Routing (OSRM)',
        enabled: false,
        configured: false,
        status: 'disabled',
      };
    }

    // Ping OSRM routing endpoint with a short dummy coordinate pair (Delhi area)
    const testUrl = `${apiUrl.replace(/\/$/, '')}/route/v1/driving/77.2090,28.6139;77.2190,28.6239?overview=false`;
    const res = await pingUrl(testUrl, {}, Math.min(timeoutMs || 3000, 3000));

    if (res.ok) {
      return {
        mode: 'road',
        provider: 'Road Routing (OSRM)',
        enabled: true,
        configured: true,
        status: 'healthy',
        latencyMs: res.latencyMs,
        pricingType: 'estimated',
        bookable: false,
      };
    }

    return {
      mode: 'road',
      provider: 'Road Routing (OSRM)',
      enabled: true,
      configured: true,
      status: 'degraded',
      latencyMs: res.latencyMs,
      pricingType: 'estimated',
      bookable: false,
      error: res.error || `HTTP ${res.status}`,
    };
  }

  async checkFlight() {
    const { enabled, apiUrl, apiKey } = config.providers.flight;
    const configured = Boolean(apiUrl && apiKey);
    return {
      mode: 'flight',
      provider: 'Flight Provider',
      enabled,
      configured,
      status: configured ? 'healthy' : 'unavailable',
      message: configured ? 'Ready' : 'FLIGHT_API_KEY not configured',
    };
  }

  async checkBus() {
    const { enabled, apiUrl, apiKey } = config.providers.bus;
    const configured = Boolean(apiUrl && apiKey);
    return {
      mode: 'bus',
      provider: 'Bus Provider',
      enabled,
      configured,
      status: configured ? 'healthy' : 'unavailable',
      message: configured ? 'Ready' : 'BUS_API_KEY not configured',
    };
  }

  async checkGeocoding() {
    const { baseUrl, userAgent } = config.geocoding;
    const testUrl = `${(baseUrl || 'https://nominatim.openstreetmap.org').replace(/\/$/, '')}/search?q=Delhi&format=json&limit=1`;
    const headers = { 'User-Agent': userAgent || 'Yatrai-Travel-Platform/1.0' };

    const res = await pingUrl(testUrl, { headers }, 3000);
    return {
      mode: 'geocoding',
      provider: 'OpenStreetMap (Nominatim)',
      enabled: true,
      configured: true,
      status: res.ok ? 'healthy' : 'degraded',
      latencyMs: res.latencyMs,
      error: res.error || (res.ok ? null : `HTTP ${res.status}`),
    };
  }
}

export const providerHealthService = new ProviderHealthService();
export default providerHealthService;
