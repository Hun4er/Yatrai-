import { useState, useCallback, useRef } from 'react';
import api from '../services/api.js';
import {
  generateActionId,
  buildP0CacheKey,
  deduplicatedFetch,
  getCachedP0Result,
  setCachedP0Result,
} from '../services/p0SearchCache.js';

/**
 * useP0JourneySearch Hook (P0 v2)
 *
 * Implements the P0 v2 frontend flow:
 * 1. Creates a UUID actionId per user search action.
 * 2. Sends mode "direct" first and renders immediately.
 * 3. If no train is CONFIRMED, client automatically sends mode "alternatives" with the
 *    SAME actionId, shows a skeleton in the alternatives section, and fills it in when it arrives.
 * 4. If a direct seat exists, provides handleExploreAlternatives (new actionId, mode "alternatives").
 * 5. Provides handleCheckMoreTrains (mode "more-trains") using DEFAULT cap.
 * 6. Provides handleSearchDeeper (mode "deep", cap 100) — enabled only when partial === true.
 * 7. Provides handleCheckClass (tap "?" chip, 1 call, own actionId).
 * 8. Provides handleRefreshCard (1 call per min rate-limited per card).
 * 9. Client cache: 5 min staleTime, in-flight deduplication.
 */
export function useP0JourneySearch() {
  const [state, setState] = useState({
    status: 'idle', // 'idle' | 'loading' | 'success' | 'empty' | 'error'
    direct: [],
    waitingTrains: [],
    uncheckedClasses: [],
    alternatives: [],
    dateStrip: [],
    partial: false,
    degraded: false,
    cancelledFilter: null,
    budget: { used: 0, cap: 40 },
    cache: { hits: 0, misses: 0 },
    error: null,
    // Loading sub-states
    isSearchingDirect: false,
    isLoadingAlternatives: false,
    isLoadingMoreTrains: false,
    isSearchingDeeper: false,
    // Track if user clicked alternatives button vs auto
    hasConfirmedDirectSeat: false,
    // Station codes
    origins: [],
    destinations: [],
    date: null,
    travelClass: 'ANY',
    quota: 'GN',
    actionId: null,
  });

  const currentActionIdRef = useRef(null);
  const searchCriteriaRef = useRef(null);

  /**
   * Main Search Entrypoint:
   * Sends mode "direct" first and renders immediately.
   */
  const search = useCallback(async (params) => {
    const {
      origin,
      destination,
      departureDate,
      date = departureDate,
      travelClass = 'ANY',
      class: cls = travelClass,
      quota = 'GN',
    } = params;

    const actionId = generateActionId();
    currentActionIdRef.current = actionId;

    const origins = Array.isArray(origin) ? origin : [origin];
    const destinations = Array.isArray(destination) ? destination : [destination];
    const dateStr = String(date || departureDate).slice(0, 10);

    searchCriteriaRef.current = { origins, destinations, date: dateStr, travelClass: cls, quota };

    setState((prev) => ({
      ...prev,
      status: 'loading',
      isSearchingDirect: true,
      error: null,
      direct: [],
      waitingTrains: [],
      alternatives: [],
      dateStrip: [],
      partial: false,
      origins,
      destinations,
      date: dateStr,
      travelClass: cls,
      quota,
      actionId,
    }));

    try {
      // Direct pass with 5-minute client cache & in-flight dedupe
      const cacheKey = buildP0CacheKey({ origins, destinations, date: dateStr, travelClass: cls, quota, mode: 'direct' });
      
      const directResponse = await deduplicatedFetch(cacheKey, () =>
        api.journeysV2.search({
          actionId,
          origins,
          destinations,
          date: dateStr,
          class: cls,
          quota,
          mode: 'direct',
        })
      );

      // Guard race conditions
      if (currentActionIdRef.current !== actionId) return;

      const directData = directResponse?.data || directResponse || {};
      const directTrains = directData.direct || [];
      const waiting = directData.waitingTrains || [];
      const unchecked = directData.uncheckedClasses || [];
      const dateStrip = directData.dateStrip || [];
      const partial = Boolean(directData.partial);
      const degraded = Boolean(directData.degraded);
      const budget = directData.budget || { used: 0, cap: 40 };
      const cacheInfo = directData.cache || { hits: 0, misses: 0 };

      // Check if any train has a confirmed seat
      const confirmedFound = directTrains.some((t) =>
        (t.classes || []).some(
          (c) => c.state === 'CHECKED' && (c.tier === 'AVAILABLE' || /AVL|AVAILABLE/i.test(c.availabilityText || ''))
        )
      );

      setState((prev) => ({
        ...prev,
        status: directTrains.length > 0 || waiting.length > 0 ? 'success' : 'empty',
        isSearchingDirect: false,
        direct: directTrains,
        waitingTrains: waiting,
        uncheckedClasses: unchecked,
        dateStrip,
        partial,
        degraded,
        budget,
        cache: cacheInfo,
        hasConfirmedDirectSeat: confirmedFound,
      }));

      // Flow rule: If NO train is CONFIRMED, automatically send mode "alternatives" with the SAME actionId
      if (!confirmedFound && !degraded) {
        runAutoAlternatives({
          actionId,
          origins,
          destinations,
          date: dateStr,
          travelClass: cls,
          quota,
        });
      }

      return directData;
    } catch (err) {
      if (currentActionIdRef.current !== actionId) return;
      setState((prev) => ({
        ...prev,
        status: 'error',
        isSearchingDirect: false,
        error: err,
      }));
      throw err;
    }
  }, []);

  /**
   * Helper: Runs automatic alternatives with SAME actionId
   */
  const runAutoAlternatives = useCallback(async ({ actionId, origins, destinations, date, travelClass, quota }) => {
    setState((prev) => ({ ...prev, isLoadingAlternatives: true }));

    try {
      const altResponse = await api.journeysV2.search({
        actionId, // SAME actionId shares the DEFAULT 40 cap!
        origins,
        destinations,
        date,
        class: travelClass,
        quota,
        mode: 'alternatives',
      });

      if (currentActionIdRef.current !== actionId) return;

      const altData = altResponse?.data || altResponse || {};
      const alternatives = altData.alternatives || [];
      const budget = altData.budget || {};
      const partial = Boolean(altData.partial);

      setState((prev) => ({
        ...prev,
        isLoadingAlternatives: false,
        alternatives,
        partial: prev.partial || partial,
        budget: { ...prev.budget, ...budget },
      }));
    } catch (err) {
      if (currentActionIdRef.current !== actionId) return;
      setState((prev) => ({
        ...prev,
        isLoadingAlternatives: false,
      }));
    }
  }, []);

  /**
   * Manual "Alternative journeys" button tap:
   * Used when a direct seat exists. Creates a NEW actionId and sends mode "alternatives" (cap 60).
   */
  const exploreAlternativesButton = useCallback(async () => {
    const criteria = searchCriteriaRef.current;
    if (!criteria) return;

    const newActionId = generateActionId();
    currentActionIdRef.current = newActionId;

    setState((prev) => ({
      ...prev,
      isLoadingAlternatives: true,
      actionId: newActionId,
    }));

    try {
      const altResponse = await api.journeysV2.search({
        actionId: newActionId,
        origins: criteria.origins,
        destinations: criteria.destinations,
        date: criteria.date,
        class: criteria.travelClass,
        quota: criteria.quota,
        mode: 'alternatives',
      });

      const altData = altResponse?.data || altResponse || {};
      setState((prev) => ({
        ...prev,
        isLoadingAlternatives: false,
        alternatives: altData.alternatives || [],
        partial: prev.partial || Boolean(altData.partial),
        budget: altData.budget || prev.budget,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoadingAlternatives: false,
      }));
    }
  }, []);

  /**
   * "Check more trains" button tap:
   * Checks next batch of waiting trains using round-1 rule.
   */
  const checkMoreTrains = useCallback(async () => {
    const { actionId, waitingTrains, date, travelClass, quota } = state;
    if (!actionId || waitingTrains.length === 0) return;

    setState((prev) => ({ ...prev, isLoadingMoreTrains: true }));

    try {
      const res = await api.journeysV2.moreTrains({
        actionId,
        waitingTrains,
        date,
        class: travelClass,
        quota,
      });

      const data = res?.data || res || {};
      const checkedBatch = data.checkedTrains || [];
      const remainingWaiting = data.remainingWaiting || [];
      const budget = data.budget || state.budget;

      setState((prev) => ({
        ...prev,
        isLoadingMoreTrains: false,
        direct: [...prev.direct, ...checkedBatch],
        waitingTrains: remainingWaiting,
        budget,
        partial: prev.partial || Boolean(data.partial),
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, isLoadingMoreTrains: false }));
    }
  }, [state]);

  /**
   * "Search deeper" button tap:
   * Enabled ONLY after partial === true. Uses mode "deep" with cap 100.
   */
  const searchDeeper = useCallback(async () => {
    const criteria = searchCriteriaRef.current;
    if (!criteria) return;

    const deepActionId = generateActionId();
    currentActionIdRef.current = deepActionId;

    setState((prev) => ({
      ...prev,
      isSearchingDeeper: true,
      actionId: deepActionId,
    }));

    try {
      const res = await api.journeysV2.search({
        actionId: deepActionId,
        origins: criteria.origins,
        destinations: criteria.destinations,
        date: criteria.date,
        class: criteria.travelClass,
        quota: criteria.quota,
        mode: 'deep',
      });

      const data = res?.data || res || {};
      setState((prev) => ({
        ...prev,
        isSearchingDeeper: false,
        alternatives: data.alternatives || prev.alternatives,
        partial: Boolean(data.partial),
        budget: data.budget || prev.budget,
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, isSearchingDeeper: false }));
    }
  }, []);

  /**
   * Single-class check on "?" chip tap:
   * 1 call under its own actionId.
   */
  const checkClass = useCallback(async ({ trainNo, from, to, class: cls, date, quota }) => {
    const singleActionId = generateActionId();
    try {
      const res = await api.journeysV2.checkClass({
        actionId: singleActionId,
        trainNo,
        from,
        to,
        class: cls,
        date,
        quota,
      });

      const data = res?.data || res || {};
      const checkedChip = data.checkedClass;

      // Update state in place
      setState((prev) => {
        const nextDirect = prev.direct.map((t) => {
          if (t.trainNumber !== trainNo) return t;
          const nextClasses = (t.classes || []).map((c) => {
            if (c.class === cls) {
              return {
                ...c,
                state: 'CHECKED',
                tier: checkedChip?.tier || checkedChip?.normalizedStatus,
                availabilityText: checkedChip?.availabilityText || checkedChip?.statusText,
                predictionPercentage: checkedChip?.predictionPercentage || 0,
                checkedAt: new Date().toISOString(),
              };
            }
            return c;
          });
          return { ...t, classes: nextClasses };
        });

        return { ...prev, direct: nextDirect };
      });

      return data;
    } catch (err) {
      throw err;
    }
  }, []);

  /**
   * Refresh single card availability:
   * Bypasses cache, rate-limited 1 per min per card.
   */
  const refreshCard = useCallback(async ({ trainNo, from, to, class: cls, date, quota }) => {
    try {
      const res = await api.journeysV2.refreshCard({
        trainNo,
        from,
        to,
        class: cls,
        date,
        quota,
      });

      const data = res?.data || res || {};
      const avail = data.availability;
      const checkedAt = data.checkedAt || new Date().toISOString();

      setState((prev) => {
        const nextDirect = prev.direct.map((t) => {
          if (t.trainNumber !== trainNo) return t;
          const nextClasses = (t.classes || []).map((c) => {
            if (c.class === cls) {
              return {
                ...c,
                state: 'CHECKED',
                tier: avail?.normalizedStatus,
                availabilityText: avail?.statusText || avail?.originalStatus,
                predictionPercentage: avail?.predictionPercentage || 0,
                checkedAt,
              };
            }
            return c;
          });
          return { ...t, classes: nextClasses, checkedAt };
        });

        return { ...prev, direct: nextDirect };
      });

      return data;
    } catch (err) {
      throw err;
    }
  }, []);

  return {
    ...state,
    search,
    exploreAlternativesButton,
    checkMoreTrains,
    searchDeeper,
    checkClass,
    refreshCard,
  };
}

export default useP0JourneySearch;
