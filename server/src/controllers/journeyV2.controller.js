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
import { resolveStationCode } from '../providers/transport/rail/rail.provider.js';
import locationService from '../services/locationService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

// In-process rate limiter for refresh-card: "trainNo:from:to:class:date" -> lastRefreshAt
const _refreshRateLimit = new Map();

/**
 * Resolve origins/destinations to station codes.
 * Accepts station codes, location names, or Location objects.
 */
async function resolveStations(inputs) {
  const codes = [];
  for (const inp of inputs) {
    if (typeof inp === 'string' && /^[A-Z]{2,5}$/i.test(inp)) {
      codes.push(inp.toUpperCase());
      continue;
    }
    const code = resolveStationCode(inp);
    if (code) { codes.push(code); continue; }
    // Try location service
    try {
      const candidates = await locationService.search(String(inp), { limit: 1 });
      const c = candidates?.[0];
      if (c) {
        const resolved = resolveStationCode(c);
        if (resolved) { codes.push(resolved); continue; }
      }
    } catch { /* ignore */ }
    logger.warn(`[JourneyV2] Could not resolve station: ${inp}`);
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
        // Resolve stations
        const origins = await resolveStations(Array.isArray(rawOrigins) ? rawOrigins : [rawOrigins]);
        const destinations = await resolveStations(Array.isArray(rawDestinations) ? rawDestinations : [rawDestinations]);

        if (origins.length === 0 || destinations.length === 0) {
          const err = new Error('Could not resolve origin or destination');
          err.code = 'STATION_NOT_FOUND';
          err.status = 400;
          throw err;
        }

        // Monthly degraded mode check (under 10% remaining quota triggers degraded mode)
        const apiUsage = await import('../services/rail/apiUsage.service.js').then((m) => m.default);
        const usageStatus = await apiUsage.getUsage('railkit');
        const isDegraded = Boolean(usageStatus.isDegraded);

        let directResult = null;
        let alternativesResult = null;

        // ── Direct pass ──────────────────────────────────────────────
        if (isAutoOrDirect) {
          directResult = await directPassService.run({
            origins,
            destinations,
            date,
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
            date,
            travelClass,
            quota,
            actionId,
            actionType: altActionType,
            referenceTrains: directResult?.direct || [],
            isDegraded,
          });
        }

        const budgetSummary = await actionBudgetService.getBudgetSummary(actionId);
        const isPartial = budgetSummary.partial || (directResult?.partial) || (alternativesResult?.partial);

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
