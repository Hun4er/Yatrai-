import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { SearchRequest } from '../models/SearchRequest.js';
import { Journey } from '../models/Journey.js';
import { JourneyLeg } from '../models/JourneyLeg.js';
import { TransportProvider } from '../models/TransportProvider.js';
import { Notification } from '../models/Notification.js';
import { ErrorLog } from '../models/ErrorLog.js';
import providerRegistry from '../providers/transport/registry.js';
import config from '../config/index.js';

/**
 * Escapes special characters for safe regular expression queries.
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safe user serializer for admin interface.
 * Strictly prevents exposure of password hashes, auth tokens, or internal secrets.
 */
export function serializeUserForAdmin(user) {
  if (!user) return null;
  const doc = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    id: doc._id?.toString() || doc.id,
    name: doc.name || '',
    email: doc.email || '',
    role: doc.role || 'user',
    status: doc.status || 'active',
    phone: doc.phone || null,
    avatar: doc.avatar || null,
    preferences: doc.preferences || {
      preferredTransportModes: [],
      preferredCurrency: 'INR',
      preferredLanguage: 'en',
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Safe provider serializer for admin interface.
 * Strictly prevents exposure of API keys, client secrets, or private configurations.
 */
export function serializeProviderForAdmin(provider) {
  if (!provider) return null;
  const doc = typeof provider.toObject === 'function' ? provider.toObject() : provider;
  return {
    id: doc._id?.toString() || doc.id || doc.code,
    name: doc.name || '',
    code: doc.code || '',
    type: doc.type || 'other',
    website: doc.website || null,
    logo: doc.logo || null,
    supportedModes: doc.supportedModes || [],
    status: doc.status || 'active',
    capabilities: doc.capabilities || {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Safe error serializer for admin list view.
 * Omits internal stack traces in lists (available only on detail view).
 */
export function serializeErrorForAdmin(err) {
  if (!err) return null;
  const doc = typeof err.toObject === 'function' ? err.toObject() : err;
  return {
    id: doc._id?.toString() || doc.id,
    timestamp: doc.timestamp || doc.createdAt,
    severity: doc.severity || 'error',
    service: doc.service || 'yatrai-api',
    module: doc.module || 'core',
    endpoint: doc.endpoint || null,
    method: doc.method || null,
    statusCode: doc.statusCode || 500,
    errorCode: doc.errorCode || 'INTERNAL_ERROR',
    message: doc.message || 'Unknown error',
    provider: doc.provider || null,
    createdAt: doc.createdAt,
  };
}

export const adminService = {
  /**
   * 1. Operational Overview Summary
   */
  async getOverviewStats() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalSearches,
      totalJourneys,
      totalProviders,
      recentErrorsCount,
      activeUsersCount,
    ] = await Promise.all([
      User.countDocuments(),
      SearchRequest.countDocuments(),
      Journey.countDocuments(),
      TransportProvider.countDocuments(),
      ErrorLog.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),
      User.countDocuments({ status: 'active' }),
    ]);

    const runtimeAdapters = providerRegistry.getAllProviders();
    const systemHealth = await this.getSystemHealth();

    return {
      users: {
        total: totalUsers,
        active: activeUsersCount,
      },
      searches: {
        total: totalSearches,
      },
      journeys: {
        total: totalJourneys,
      },
      providers: {
        configured: totalProviders,
        runtimeAdapters: runtimeAdapters.length,
      },
      errors: {
        last24Hours: recentErrorsCount,
      },
      systemHealth: {
        status: systemHealth.status,
        database: systemHealth.readiness?.checks?.database?.status || 'unknown',
        uptimeSeconds: systemHealth.liveness?.uptimeSeconds || 0,
      },
    };
  },

  /**
   * 2. Users List & Filtering
   */
  async getUsers({ page = 1, limit = 20, search = '', role = '', status = '', sort = '-createdAt' }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (role && ['user', 'admin'].includes(role)) {
      query.role = role;
    }

    if (status && ['active', 'inactive', 'suspended'].includes(status)) {
      query.status = status;
    }

    if (search && search.trim()) {
      const escaped = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
      User.countDocuments(query),
    ]);

    return {
      data: users.map(serializeUserForAdmin),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  },

  /**
   * 3. Searches List & Filtering
   */
  async getSearches({
    page = 1,
    limit = 20,
    status = '',
    search = '',
    startDate = null,
    endDate = null,
    sort = '-createdAt',
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const s = new Date(startDate);
        if (!isNaN(s.getTime())) query.createdAt.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        if (!isNaN(e.getTime())) query.createdAt.$lte = e;
      }
    }

    const [searches, total] = await Promise.all([
      SearchRequest.find(query)
        .populate('user', 'name email role')
        .populate('origin', 'name displayName city state type')
        .populate('destination', 'name displayName city state type')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SearchRequest.countDocuments(query),
    ]);

    const formatted = searches.map((s) => ({
      id: s._id?.toString() || s.id,
      user: s.user
        ? {
            id: s.user._id?.toString() || s.user.id,
            name: s.user.name,
            email: s.user.email,
            role: s.user.role,
          }
        : null,
      origin: s.origin
        ? {
            id: s.origin._id?.toString() || s.origin.id,
            name: s.origin.name || s.origin.displayName,
            city: s.origin.city,
            state: s.origin.state,
          }
        : null,
      destination: s.destination
        ? {
            id: s.destination._id?.toString() || s.destination.id,
            name: s.destination.name || s.destination.displayName,
            city: s.destination.city,
            state: s.destination.state,
          }
        : null,
      departureDate: s.departureDate,
      passengers: s.passengers || 1,
      requestedModes: s.requestedModes || [],
      priority: s.preferences?.priority || 'balanced',
      status: s.status,
      createdAt: s.createdAt,
    }));

    return {
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  },

  /**
   * 4. Journeys List & Filtering
   */
  async getJourneys({
    page = 1,
    limit = 20,
    mode = '',
    status = '',
    sort = '-createdAt',
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (mode && mode.trim()) {
      query.transportModes = mode.trim().toLowerCase();
    }

    const [journeys, total] = await Promise.all([
      Journey.find(query)
        .populate('origin', 'name displayName city state')
        .populate('destination', 'name displayName city state')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Journey.countDocuments(query),
    ]);

    const formatted = journeys.map((j) => ({
      id: j._id?.toString() || j.id,
      origin: j.origin
        ? {
            id: j.origin._id?.toString() || j.origin.id,
            name: j.origin.name || j.origin.displayName,
            city: j.origin.city,
            state: j.origin.state,
          }
        : null,
      destination: j.destination
        ? {
            id: j.destination._id?.toString() || j.destination.id,
            name: j.destination.name || j.destination.displayName,
            city: j.destination.city,
            state: j.destination.state,
          }
        : null,
      departureTime: j.departureTime,
      arrivalTime: j.arrivalTime,
      duration: j.duration,
      totalDistance: j.totalDistance,
      totalPrice: j.totalPrice,
      currency: j.currency || 'INR',
      numberOfTransfers: j.numberOfTransfers || 0,
      transportModes: j.transportModes || [],
      status: j.status,
      createdAt: j.createdAt,
    }));

    return {
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  },

  /**
   * 5. Providers Status & Configuration
   */
  async getProviders() {
    const dbProviders = await TransportProvider.find().sort({ code: 1 }).lean();

    const runtimeAdapters = providerRegistry.getAllProviders().map((adapter) => ({
      mode: adapter.mode,
      code: adapter.code || adapter.mode?.toUpperCase(),
      name: adapter.name || `${adapter.mode} Provider Adapter`,
      capabilities: adapter.capabilities || {},
      timeoutMs: adapter.timeoutMs || 5000,
      status: 'active',
      isRuntimeAdapter: true,
    }));

    return {
      databaseProviders: dbProviders.map(serializeProviderForAdmin),
      runtimeAdapters,
      summary: {
        configuredCount: dbProviders.length,
        activeAdaptersCount: runtimeAdapters.length,
      },
    };
  },

  /**
   * 6. Errors List & Filtering
   */
  async getErrors({
    page = 1,
    limit = 20,
    severity = '',
    statusCode = '',
    provider = '',
    search = '',
    startDate = null,
    endDate = null,
    sort = '-createdAt',
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (severity && ['info', 'warn', 'error', 'fatal'].includes(severity)) {
      query.severity = severity;
    }

    if (statusCode) {
      const codeNum = parseInt(statusCode, 10);
      if (!isNaN(codeNum)) query.statusCode = codeNum;
    }

    if (provider && provider.trim()) {
      query.provider = provider.trim();
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const s = new Date(startDate);
        if (!isNaN(s.getTime())) query.createdAt.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        if (!isNaN(e.getTime())) query.createdAt.$lte = e;
      }
    }

    if (search && search.trim()) {
      const escaped = escapeRegex(search.trim());
      query.$or = [
        { message: { $regex: escaped, $options: 'i' } },
        { endpoint: { $regex: escaped, $options: 'i' } },
        { errorCode: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [errors, total] = await Promise.all([
      ErrorLog.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
      ErrorLog.countDocuments(query),
    ]);

    return {
      data: errors.map(serializeErrorForAdmin),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  },

  /**
   * 7. Error Detail with Diagnostic Stack (Admins Only)
   */
  async getErrorById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }

    const errorDoc = await ErrorLog.findById(id).lean();
    if (!errorDoc) return null;

    return {
      id: errorDoc._id.toString(),
      timestamp: errorDoc.timestamp || errorDoc.createdAt,
      severity: errorDoc.severity,
      service: errorDoc.service,
      module: errorDoc.module,
      endpoint: errorDoc.endpoint,
      method: errorDoc.method,
      statusCode: errorDoc.statusCode,
      errorCode: errorDoc.errorCode,
      message: errorDoc.message,
      stack: errorDoc.stack || null,
      provider: errorDoc.provider || null,
      details: errorDoc.details || null,
      createdAt: errorDoc.createdAt,
    };
  },

  /**
   * 8. Operational Analytics (MongoDB Aggregation Pipelines)
   */
  async getAnalytics() {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [
      userRoleAgg,
      userStatusAgg,
      searchStatusAgg,
      searchesOverTimeAgg,
      searchesByModeAgg,
      journeyStatsAgg,
      errorSeverityAgg,
      errorStatusCategoryAgg,
      notificationStatsAgg,
    ] = await Promise.all([
      // Users by role
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),

      // Users by status
      User.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

      // Searches by status
      SearchRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

      // Searches over last 14 days
      SearchRequest.aggregate([
        { $match: { createdAt: { $gte: fourteenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Searches by requested modes
      SearchRequest.aggregate([
        { $unwind: '$requestedModes' },
        { $group: { _id: '$requestedModes', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Journey metrics
      Journey.aggregate([
        {
          $group: {
            _id: null,
            totalJourneys: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
            avgPrice: { $avg: '$totalPrice' },
            minPrice: { $min: '$totalPrice' },
            maxPrice: { $max: '$totalPrice' },
          },
        },
      ]),

      // Errors by severity
      ErrorLog.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]),

      // Errors by status category (4xx vs 5xx)
      ErrorLog.aggregate([
        {
          $project: {
            category: {
              $cond: [
                { $and: [{ $gte: ['$statusCode', 400] }, { $lt: ['$statusCode', 500] }] },
                'client_4xx',
                { $cond: [{ $gte: ['$statusCode', 500] }, 'server_5xx', 'other'] },
              ],
            },
          },
        },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),

      // Notification read stats
      Notification.aggregate([{ $group: { _id: '$read', count: { $sum: 1 } } }]),
    ]);

    // Format search status breakdown
    const searchStatusCounts = {};
    let totalSearches = 0;
    for (const item of searchStatusAgg) {
      searchStatusCounts[item._id] = item.count;
      totalSearches += item.count;
    }
    const completedSearches = searchStatusCounts.completed || 0;
    const failedSearches = searchStatusCounts.failed || 0;
    const successRate = totalSearches > 0 ? Math.round((completedSearches / totalSearches) * 100) : 0;

    return {
      users: {
        byRole: userRoleAgg.reduce((acc, cur) => ({ ...acc, [cur._id]: cur.count }), {}),
        byStatus: userStatusAgg.reduce((acc, cur) => ({ ...acc, [cur._id]: cur.count }), {}),
      },
      searches: {
        total: totalSearches,
        completed: completedSearches,
        failed: failedSearches,
        successRatePercentage: successRate,
        byStatus: searchStatusCounts,
        overTime: searchesOverTimeAgg.map((s) => ({ date: s._id, count: s.count })),
        byRequestedMode: searchesByModeAgg.map((m) => ({ mode: m._id, count: m.count })),
      },
      journeys: {
        total: journeyStatsAgg[0]?.totalJourneys || 0,
        averageDurationMinutes: Math.round(journeyStatsAgg[0]?.avgDuration || 0),
        averagePriceINR: Math.round(journeyStatsAgg[0]?.avgPrice || 0),
        minPriceINR: journeyStatsAgg[0]?.minPrice || 0,
        maxPriceINR: journeyStatsAgg[0]?.maxPrice || 0,
      },
      errors: {
        bySeverity: errorSeverityAgg.reduce((acc, cur) => ({ ...acc, [cur._id]: cur.count }), {}),
        byCategory: errorStatusCategoryAgg.reduce((acc, cur) => ({ ...acc, [cur._id]: cur.count }), {}),
      },
      notifications: {
        total: notificationStatsAgg.reduce((acc, cur) => acc + cur.count, 0),
        byReadStatus: notificationStatsAgg.reduce(
          (acc, cur) => ({ ...acc, [cur._id ? 'read' : 'unread']: cur.count }),
          {}
        ),
      },
    };
  },

  /**
   * 9. System Health (Liveness & Readiness Breakdown)
   */
  async getSystemHealth() {
    const dbStateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    const dbStatus = dbStateMap[mongoose.connection.readyState] || 'unknown';
    const isDbConnected = mongoose.connection.readyState === 1;

    // Check runtime provider adapters
    const adapters = providerRegistry.getAllProviders();
    const coreModes = ['road', 'rail', 'bus', 'flight'];
    const registeredModes = adapters.map((a) => a.mode?.toLowerCase());
    const missingCoreModes = coreModes.filter((m) => !registeredModes.includes(m));
    const isProvidersHealthy = missingCoreModes.length === 0;

    // Memory usage
    const memory = process.memoryUsage();

    // Determine overall health status
    let overallStatus = 'HEALTHY';
    if (!isDbConnected) {
      overallStatus = 'UNAVAILABLE';
    } else if (!isProvidersHealthy) {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      liveness: {
        status: 'healthy',
        service: 'yatrai-api',
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        environment: config.env,
      },
      readiness: {
        status: overallStatus.toLowerCase(),
        checks: {
          database: {
            status: isDbConnected ? 'healthy' : 'unavailable',
            state: dbStatus,
          },
          providers: {
            status: isProvidersHealthy ? 'healthy' : 'degraded',
            registeredAdaptersCount: adapters.length,
            registeredModes,
            missingCoreModes,
          },
          memory: {
            status: 'healthy',
            heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
            rssMB: Math.round(memory.rss / 1024 / 1024),
          },
        },
      },
    };
  },
};

export default adminService;
