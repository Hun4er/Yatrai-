/**
 * JourneyV2 Controller  (P0 v2)
 *
 * Thin HTTP controller for the 4 new endpoints:
 *   POST /api/v2/journeys/search
 *   POST /api/v2/journeys/check-class
 *   POST /api/v2/journeys/refresh-card
 *   POST /api/v2/journeys/more-trains
 */

import directPassService from '../services/rail/directPass.service.js';
import alternativesEngineService from '../services/rail/alternativesEngine.service.js';
import actionBudgetService, { getCapForActionType } from '../services/rail/actionBudget.service.js';
import availabilityService from '../services/rail/availability.service.js';
import clusterService from '../services/rail/cluster.service.js';
import { resolveStationCode } from '../providers/transport/rail/rail.provider.js';
import locationService from '../services/locationService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { formatJourneyDate, formatInIST } from '../utils/railwayTime.js';
import { getAdvanceBookingWindow } from '../utils/bookingWindow.js';

// In-process rate limiter for refresh-card: "trainNo:from:to:class:date" -> lastRefreshAt
const _refreshRateLimit = new Map();

/**
 * Resolve origins/destinations to station codes.
 * Accepts station codes, location names, or Location objects.
 */
async function resolveStations(inputs) {
  const codes = [];
  for (const inp of inputs) {
    if (!inp) continue;
    if (typeof inp === 'object') {
      const codeProp = inp.code || inp.stationCode || inp.id;
      if (codeProp && /^[A-Z]{2,5}$/i.test(String(codeProp).trim())) {
        codes.push(String(codeProp).trim().toUpperCase());
        continue;
      }
    }
    if (typeof inp === 'string' && /^[A-Z]{2,5}$/i.test(inp.trim())) {
      codes.push(inp.trim().toUpperCase());
      continue;
    }
    const code = resolveStationCode(inp);
    if (code && /^[A-Z]{2,5}$/.test(code) && code !== String(inp).trim().toUpperCase()) {
      codes.push(code);
      continue;
    }
    // Try location service
    try {
      const queryStr = typeof inp === 'object'
        ? (inp.name || inp.cityName || inp.query || JSON.stringify(inp))
        : String(inp);
      const candidates = await locationService.search(queryStr, { limit: 1 });
      const c = candidates?.[0];
      if (c) {
        const resolved = resolveStationCode(c) || c.code || c.stationCode;
        if (resolved && /^[A-Z]{2,5}$/i.test(String(resolved).trim())) {
          codes.push(String(resolved).trim().toUpperCase());
          continue;
        }
      }
    } catch { /* ignore */ }
    logger.warn(`[JourneyV2] Could not resolve station: ${typeof inp === 'object' ? JSON.stringify(inp) : inp}`);
  }
  return [...new Set(codes.filter(Boolean))];
}

export const journeyV2Controller = {
  /**
   * POST /api/v2/journeys/search
   *
   * Unified search endpoint.  mode determines which phase runs:
   *   "direct"       → direct pass only
   *   "auto"         → direct pass; if no CONFIRMED, also runs alternatives with SAME actionId
   *   "alternatives" → alternatives only (uses cached direct results, no direct-pass calls)
   *   "deep"         → alternatives with DEEP caps
   */
  async search(req, res, next) {
    try {
      const {
        actionId,
        origins: rawOrigins = [],
        destinations: rawDestinations = [],
        date,
        class: travelClass = 'ANY',
        quota = 'GN',
        mode = 'direct',
        includeRisky = false,
      } = req.body || {};

      if (!actionId) {
        return res.status(400).json(errorResponse('actionId is required', 'MISSING_ACTION_ID'));
      }
      if (!date) {
        return res.status(400).json(errorResponse('date is required', 'MISSING_DATE'));
      }

      // ── Date Validations ───────────────────────────────────────────
      const formattedDate = formatJourneyDate(date);
      if (!formattedDate) {
        return res.status(400).json(errorResponse('Invalid travel date format. Use YYYY-MM-DD.', 'INVALID_DATE_FORMAT'));
      }

      const bookingWindow = getAdvanceBookingWindow();
      if (bookingWindow.isPast(formattedDate)) {
        return res.status(400).json(errorResponse('Journey date cannot be in the past.', 'PAST_DATE'));
      }

      // 60-day advance booking window: search anyway, show notice if beyond window
      const isBeyondAdvanceWindow = bookingWindow.isBeyondWindow(formattedDate);
      const initialNotice = isBeyondAdvanceWindow ? 'booking may not be open for this date yet' : null;

      // ── Station Resolution & Cluster Expansion ────────────────────
      const origins = await resolveStations(Array.isArray(rawOrigins) ? rawOrigins : [rawOrigins]);
      const destinations = await resolveStations(Array.isArray(rawDestinations) ? rawDestinations : [rawDestinations]);

      if (origins.length === 0 || destinations.length === 0) {
        return res.status(400).json(
          errorResponse('Could not resolve origin or destination station', 'STATION_NOT_FOUND')
        );
      }

      // Expand same-city cluster stations while preserving primary requested station first
      const expandedOrigins = [
        ...new Set(origins.flatMap((o) => clusterService.getClusterStationCodes(o))),
      ];
      const expandedDestinations = [
        ...new Set(destinations.flatMap((d) => clusterService.getClusterStationCodes(d))),
      ];

      // Canonicalize mode aliases:
      // "default" / "direct" / "auto"
      // "alternatives_button" / "alternatives"
      // "deep"
      const normalizedMode = String(mode || 'default').toLowerCase().trim();
      const isAlternativesMode = normalizedMode === 'alternatives' || normalizedMode === 'alternatives_button';
      const isDeepMode = normalizedMode === 'deep';
      const isAutoOrDirect = normalizedMode === 'default' || normalizedMode === 'auto' || normalizedMode === 'direct';

      // Determine action type from canonical mode
      const actionType = isDeepMode ? 'deep' : (isAlternativesMode ? 'alternatives_button' : 'default');

      // Ensure ledger exists with correct cap
      await actionBudgetService.getOrCreate(actionId, actionType);

      // Single-flight deduplication on duplicate clicks carrying the same actionId
      const searchResultData = await actionBudgetService.singleFlight(`search_req:${actionId}`, async () => {
        // Monthly degraded mode check (under 10% remaining quota triggers degraded mode)
        const apiUsage = await import('../services/rail/apiUsage.service.js').then((m) => m.default);
        const usageStatus = await apiUsage.getUsage('railkit');
        const isDegraded = Boolean(usageStatus.isDegraded);

        let directResult = null;
        let alternativesResult = null;

        // ── Direct pass ──────────────────────────────────────────────
        if (isAutoOrDirect) {
          directResult = await directPassService.run({
            origins: expandedOrigins,
            destinations: expandedDestinations,
            date: formattedDate,
            travelClass,
            quota,
            actionId,
            actionType,
          });
        }

        // ── Alternatives ─────────────────────────────────────────────
        const shouldRunAlternatives =
          isAlternativesMode ||
          isDeepMode ||
          ((normalizedMode === 'auto' || normalizedMode === 'default') && directResult && !directResult.confirmedFound);

        if (shouldRunAlternatives) {
          const altActionType = isDeepMode ? 'deep' : 'alternatives_button';
          const originCode = origins[0];
          const destCode = destinations[0];
          alternativesResult = await alternativesEngineService.run({
            originCode,
            destCode,
            date: formattedDate,
            travelClass,
            quota,
            actionId,
            actionType: altActionType,
            referenceTrains: directResult?.direct || [],
            isDegraded,
          });
        }

        const budgetSummary = await actionBudgetService.getBudgetSummary(actionId);
        const isPartial = budgetSummary.partial || Boolean(directResult?.partial) || Boolean(alternativesResult?.partial);
        const providerNotice = initialNotice || directResult?.providerNotice || alternativesResult?.providerNotice || null;

        // Build helpful message if no direct trains
        let message = directResult?.message || null;
        if (directResult?.allCancelled) {
          message = 'All direct trains on this route are cancelled for the selected date.';
        } else if (directResult?.noTrainsFound) {
          message = 'No direct trains found between selected stations.';
        }

        // Phase 11: Demo Mode — store last good search result
        if (directResult?.direct?.length > 0 || alternativesResult?.alternatives?.length > 0) {
          const originCode = (origins || [])[0];
          const destCode = (destinations || [])[0];
          if (originCode && destCode) {
            persistentCacheService.set(
              `demo:search:${originCode}:${destCode}`,
              {
                direct: (directResult?.direct || []).map((t) => ({ ...t, isCachedResult: true })),
                waitingTrains: directResult?.waitingTrains || [],
                uncheckedClasses: directResult?.uncheckedClasses || [],
                alternatives: (alternativesResult?.alternatives || []).map((a) => ({ ...a, isCachedResult: true })),
                dateStrip: directResult?.dateStrip || [],
                partial: false,
                degraded: false,
              },
              'timetable',
              24 * 60 * 60 * 1000
            ).catch(() => {});
          }
        }

        // TODO[DATE_STRIP]: 4-date strip populated from availability responses where supported
        logger.debug('[JourneyV2] TODO[DATE_STRIP]: Date strip verified or defaulted to empty array');

        return {
          direct: directResult?.direct || [],
          waitingTrains: directResult?.waitingTrains || [],
          uncheckedClasses: directResult?.uncheckedClasses || [],
          alternatives: alternativesResult?.alternatives || [],
          dateStrip: directResult?.dateStrip || [],
          partial: isPartial,
          degraded: isDegraded,
          providerNotice,
          allCancelled: directResult?.allCancelled || false,
          noTrainsFound: directResult?.noTrainsFound || false,
          message,
          cancelledFilter: directResult?.cancelledFilter || null,
          budget: budgetSummary,
          cache: {
            hits: budgetSummary.cacheHits,
            misses: budgetSummary.cacheMisses,
          },
        };
      });

      return res.status(200).json(successResponse('Journey search completed', searchResultData));
    } catch (err) {
      if (err.code === 'STATION_NOT_FOUND') {
        return res.status(400).json(errorResponse(err.message, 'STATION_NOT_FOUND'));
      }

      // If beyond 60-day booking window and provider failed or returned not-bookable, return 200 with notice
      const isBeyondWindow = getAdvanceBookingWindow().isBeyondWindow(formatJourneyDate(req.body?.date));
      if (isBeyondWindow) {
        logger.info(`[JourneyV2] Date beyond 60-day window and provider returned error: ${err.message}. Returning 200 with notice.`);
        const actionId = req.body?.actionId;
        const budgetSummary = actionId
          ? await actionBudgetService.getBudgetSummary(actionId).catch(() => ({ used: 0, cap: 40 }))
          : { used: 0, cap: 40 };

        return res.status(200).json(
          successResponse('Journey search completed', {
            direct: [],
            waitingTrains: [],
            uncheckedClasses: [],
            alternatives: [],
            dateStrip: [],
            partial: false,
            degraded: false,
            providerNotice: 'booking may not be open for this date yet',
            allCancelled: false,
            noTrainsFound: true,
            message: 'Booking may not be open for this date yet.',
            budget: budgetSummary,
            cache: { hits: 0, misses: 0 },
          })
        );
      }

      // Graceful fallback for RailKit 429 and 5xx provider disruptions
      const isProviderErr =
        err.status === 429 ||
        (err.status >= 500 && err.status < 600) ||
        err.code === 'PROVIDER_RATE_LIMITED' ||
        err.code === 'PROVIDER_UNAVAILABLE' ||
        err.code === 'LIVE_REQUESTS_BLOCKED' ||
        (err.message && /429|500|502|503|504|RailKit/i.test(err.message));

      if (isProviderErr) {
        logger.warn(`[JourneyV2] Third-party provider error encountered during search: ${err.message}`);

        // Phase 11: DEMO_MODE fallback
        if (process.env.DEMO_MODE === 'true') {
          const originCode = (req.body?.origins || [])[0];
          const destCode = (req.body?.destinations || [])[0];
          const demoCacheKey = `demo:search:${originCode}:${destCode}`;
          const cachedFallback = await persistentCacheService.get(demoCacheKey);
          if (cachedFallback) {
            logger.info(`[DEMO_MODE] Serving last good cached response for ${originCode}->${destCode}`);
            const actionId = req.body?.actionId;
            const budgetSummary = actionId
              ? await actionBudgetService.getBudgetSummary(actionId).catch(() => ({ used: 0, cap: 40 }))
              : { used: 0, cap: 40 };
            return res.status(200).json(
              successResponse('Journey search completed (cached demo result)', {
                ...cachedFallback,
                isCachedResult: true,
                cachedResultLabel: 'cached result',
                providerNotice: 'Live provider unavailable — serving last good cached result',
                budget: budgetSummary,
                cache: { hits: 1, misses: 0 },
              })
            );
          }
        }

        const actionId = req.body?.actionId;
        const budgetSummary = actionId
          ? await actionBudgetService.getBudgetSummary(actionId).catch(() => ({ used: 0, cap: 40 }))
          : { used: 0, cap: 40 };

        return res.status(200).json(
          successResponse('Journey search completed (partial)', {
            direct: [],
            waitingTrains: [],
            uncheckedClasses: [],
            alternatives: [],
            dateStrip: [],
            partial: true,
            degraded: true,
            providerNotice:
              'Live rail data provider is experiencing high load or temporary service disruption. Results may be partial or limited.',
            budget: budgetSummary,
            cache: { hits: 0, misses: 0 },
          })
        );
      }
      return next(err);
    }
  },

  /**
   * POST /api/v2/journeys/check-class
   * Checks a single class for a train (tap on "?" chip).
   * Uses its own per-action cap (100).
   */
  async checkClass(req, res, next) {
    try {
      const { actionId, trainNo, from, to, class: travelClass, date, quota = 'GN' } = req.body || {};
      if (!actionId || !trainNo || !from || !to || !travelClass || !date) {
        return res.status(400).json(errorResponse('Missing required fields', 'MISSING_FIELDS'));
      }

      await actionBudgetService.getOrCreate(actionId, 'check_class');
      const result = await directPassService.checkClass({ trainNo, from, to, travelClass, date, quota, actionId });
      return res.status(200).json(successResponse('Class checked', result));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /api/v2/journeys/refresh-card
   * Makes 1 fresh availability call bypassing cache.
   * Rate limited: 1 call per minute per card.
   */
  async refreshCard(req, res, next) {
    try {
      const { trainNo, from, to, class: travelClass, date, quota = 'GN' } = req.body || {};
      if (!trainNo || !from || !to || !travelClass || !date) {
        return res.status(400).json(errorResponse('Missing required fields', 'MISSING_FIELDS'));
      }

      const rateLimitKey = `${trainNo}:${from}:${to}:${travelClass}:${date}`;
      const lastRefresh = _refreshRateLimit.get(rateLimitKey);
      const rateLimitMs = config.p0v2.refreshCardRateLimitMs;
      if (lastRefresh && Date.now() - lastRefresh < rateLimitMs) {
        const waitMs = rateLimitMs - (Date.now() - lastRefresh);
        return res.status(429).json(
          errorResponse(`Rate limited. Please wait ${Math.ceil(waitMs / 1000)}s before refreshing again.`, 'REFRESH_RATE_LIMITED')
        );
      }
      _refreshRateLimit.set(rateLimitKey, Date.now());

      // Bypass cache: clear the specific cache entry in availability service
      const cacheKey = availabilityService.buildCacheKey(trainNo, from, to, date, travelClass, quota);
      availabilityService.cache.delete(cacheKey);

      const result = await availabilityService.checkLegAvailability({
        trainNumber: trainNo,
        fromCode: from,
        toCode: to,
        date,
        travelClass,
        quota,
      });

      return res.status(200).json(successResponse('Card refreshed', { availability: result, checkedAt: new Date().toISOString() }));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /api/v2/journeys/more-trains
   * Checks the next batch of up to 8 waiting trains with round-1 rule.
   */
  async moreTrains(req, res, next) {
    try {
      const { actionId, trainNos, waitingTrains = [], date, class: travelClass = 'ANY', quota = 'GN' } = req.body || {};
      if (!actionId || !date) {
        return res.status(400).json(errorResponse('actionId and date are required', 'MISSING_FIELDS'));
      }

      await actionBudgetService.getOrCreate(actionId, 'default');
      const result = await directPassService.moreTrains({
        actionId,
        trainNos,
        allWaitingTrains: waitingTrains,
        date,
        travelClass,
        quota,
      });

      return res.status(200).json(successResponse('More trains checked', result));
    } catch (err) {
      return next(err);
    }
  },
};

export default journeyV2Controller;
