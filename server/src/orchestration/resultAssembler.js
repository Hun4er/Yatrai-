/**
 * Result Assembler Service
 *
 * Implements Phase 8 final result assembly:
 * Assembles a clean, canonical API response combining ranked canonical journeys,
 * request lifecycle metadata, safe provider execution statuses, and deduplication diagnostics.
 *
 * Invariants:
 * - Never exposes raw provider credentials, tokens, or internal stack traces.
 * - Conforms to the standard Yatrai API response structure.
 * - Exposes both top-level and nested `journeys` arrays for full backward compatibility.
 */
export class ResultAssembler {
  /**
   * Formats a canonical location document/object for safe API consumption.
   *
   * @param {Object} loc
   * @returns {Object|null}
   */
  formatLocation(loc) {
    if (!loc) return null;
    const raw = typeof loc.toJSON === 'function' ? loc.toJSON() : loc;
    return {
      id: raw._id ? raw._id.toString() : raw.id || null,
      name: raw.name || '',
      displayName: raw.displayName || raw.name || '',
      city: raw.city || '',
      state: raw.state || '',
      type: raw.type || 'station',
      coordinates: raw.location?.coordinates || raw.coordinates || null,
    };
  }

  /**
   * Cleans and prepares safe provider metadata for external visibility.
   * Redacts any internal exception objects, credentials, or sensitive tokens.
   *
   * @param {Array<Object>} providerSummaries
   * @returns {Array<Object>}
   */
  formatProviderStatuses(providerSummaries = []) {
    if (!Array.isArray(providerSummaries)) return [];

    return providerSummaries.map((p) => {
      const summary = {
        provider: p.provider || p.mode || 'unknown',
        status: p.status || 'unknown',
        resultCount: typeof p.resultCount === 'number' ? p.resultCount : (p.candidates?.length || 0),
      };

      if (p.error) {
        // Expose safe high-level error message without leaking sensitive internals
        summary.error = {
          code: p.error.code || 'PROVIDER_ERROR',
          message: p.error.message || 'Provider query unsuccessful',
        };
      }

      if (p.durationMs !== undefined) {
        summary.durationMs = p.durationMs;
      }

      return summary;
    });
  }

  /**
   * Assembles the final orchestrated search result payload.
   *
   * @param {Object} params
   * @param {Object} [params.searchRequest] - SearchRequest Mongoose document
   * @param {Object} params.origin - Canonical origin Location
   * @param {Object} params.destination - Canonical destination Location
   * @param {Array<Object>} params.journeys - Ranked canonical journeys
   * @param {Object} params.rankingStrategy - Ranking strategy instance or descriptor
   * @param {Array<Object>} [params.providerStatuses=[]] - Safe provider execution summaries
   * @param {Object} [params.deduplicationReport={}] - Deduplication audit report
   * @param {number} [params.durationMs=0] - Total orchestration elapsed time
   * @param {string} [params.searchedAt] - ISO timestamp
   * @returns {Object} Canonical search result payload
   */
  assemble({
    searchRequest,
    origin,
    destination,
    journeys = [],
    rankingStrategy = {},
    providerStatuses = [],
    deduplicationReport = {},
    durationMs = 0,
    searchedAt,
  }) {
    const formattedOrigin = this.formatLocation(origin);
    const formattedDest = this.formatLocation(destination);
    const safeProviders = this.formatProviderStatuses(providerStatuses);

    const successfulProviders = safeProviders.filter((p) => p.status === 'success').length;
    const failedProviders = safeProviders.filter((p) => p.status === 'failed').length;

    const meta = {
      searchedAt: searchedAt || new Date().toISOString(),
      durationMs,
      providers: safeProviders,
      providersQueried: safeProviders.length,
      providersSuccessful: successfulProviders,
      providersFailed: failedProviders,
      resultCount: journeys.length,
    };

    if (deduplicationReport && Object.keys(deduplicationReport).length > 0) {
      meta.deduplication = {
        totalBefore: deduplicationReport.totalBefore ?? journeys.length,
        totalAfter: deduplicationReport.totalAfter ?? journeys.length,
        duplicatesRemoved: deduplicationReport.duplicatesRemoved ?? 0,
      };
    }

    return {
      searchRequestId: searchRequest?._id ? searchRequest._id.toString() : null,
      status: searchRequest?.status || 'completed',
      count: journeys.length,
      totalResults: journeys.length,
      origin: formattedOrigin,
      destination: formattedDest,
      ranking: {
        strategy: rankingStrategy.id || rankingStrategy.strategy || 'overall',
        label: rankingStrategy.name || rankingStrategy.label || 'Best Overall',
      },
      meta,
      journeys,
    };
  }
}

export const resultAssembler = new ResultAssembler();
export default resultAssembler;
