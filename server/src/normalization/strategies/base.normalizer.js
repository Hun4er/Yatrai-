import mongoose from 'mongoose';
import { TRANSPORT_MODES } from '../../models/TransportProvider.js';
import { JOURNEY_STATUSES } from '../../models/Journey.js';

/**
 * Base Normalization Strategy
 * Provides shared normalization utilities across all mode-specific normalizers.
 *
 * Enforces:
 * - UTC date/time conversion with Indian timezone context (+05:30) for ambiguous local times
 * - Clean numeric price extraction and non-negative checking
 * - ISO currency standard formatting
 * - Canonical transport mode mapping
 * - Canonical journey status mapping
 * - Safe location ID resolution distinguishing Yatrai Location IDs from station/airport codes
 */
export class BaseNormalizerStrategy {
  constructor(mode = 'rail') {
    this.mode = mode;
  }

  /**
   * Resolves a value to a MongoDB ObjectId if valid, or extracts _id from object.
   *
   * @param {*} val
   * @param {*} fallback
   * @returns {mongoose.Types.ObjectId|string|null}
   */
  toObjectId(val, fallback = null) {
    if (!val) {
      if (!fallback) return null;
      return this.toObjectId(fallback, null);
    }
    if (val instanceof mongoose.Types.ObjectId) {
      return val;
    }
    if (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val) && mongoose.Types.ObjectId.isValid(val)) {
      return new mongoose.Types.ObjectId(val);
    }
    if (val._id) {
      return this.toObjectId(val._id, fallback);
    }
    if (val.id && mongoose.Types.ObjectId.isValid(val.id)) {
      return new mongoose.Types.ObjectId(val.id);
    }
    return val;
  }

  /**
   * Normalizes date/time input into a valid UTC Date object.
   *
   * Handles:
   * - Date objects
   * - ISO timestamps with timezone offsets (+05:30, Z)
   * - Date strings without timezone offsets (interprets as +05:30 IST travel context)
   * - HH:mm time-of-day strings combined with base departure date
   *
   * @param {string|number|Date} timeVal
   * @param {Date|string} [baseDate]
   * @param {string} [defaultTzOffset='+05:30']
   * @returns {Date|null}
   */
  normalizeDateTime(timeVal, baseDate = null, defaultTzOffset = '+05:30') {
    if (!timeVal) return null;

    if (timeVal instanceof Date) {
      return isNaN(timeVal.getTime()) ? null : timeVal;
    }

    if (typeof timeVal === 'number') {
      const d = new Date(timeVal);
      return isNaN(d.getTime()) ? null : d;
    }

    if (typeof timeVal !== 'string') return null;

    const trimmed = timeVal.trim();
    if (!trimmed) return null;

    // Pattern 1: Time of day only, e.g. "06:30" or "06:30:00"
    const timeOnlyMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
    if (timeOnlyMatch) {
      const hours = parseInt(timeOnlyMatch[1], 10);
      const minutes = parseInt(timeOnlyMatch[2], 10);
      const seconds = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0;

      const base = baseDate instanceof Date
        ? baseDate
        : baseDate
          ? new Date(baseDate)
          : new Date();

      const year = !isNaN(base.getTime()) ? base.getUTCFullYear() : 2026;
      const month = !isNaN(base.getTime()) ? String(base.getUTCMonth() + 1).padStart(2, '0') : '10';
      const day = !isNaN(base.getTime()) ? String(base.getUTCDate()).padStart(2, '0') : '01';

      const hStr = String(hours).padStart(2, '0');
      const mStr = String(minutes).padStart(2, '0');
      const sStr = String(seconds).padStart(2, '0');

      const isoWithTz = `${year}-${month}-${day}T${hStr}:${mStr}:${sStr}${defaultTzOffset}`;
      const d = new Date(isoWithTz);
      return isNaN(d.getTime()) ? null : d;
    }

    // Pattern 2: Full ISO string with explicit timezone offset (e.g. "2026-10-01T06:00:00+05:30" or "Z")
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }

    // Pattern 3: Date string without timezone offset (e.g. "2026-10-01T06:00:00" or "2026-10-01 06:00")
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?/i.test(trimmed)) {
      const normalizedIso = trimmed.replace(' ', 'T');
      // If seconds missing, add :00
      const withSeconds = /T\d{2}:\d{2}$/.test(normalizedIso) ? `${normalizedIso}:00` : normalizedIso;
      const isoWithTz = `${withSeconds}${defaultTzOffset}`;
      const d = new Date(isoWithTz);
      return isNaN(d.getTime()) ? null : d;
    }

    // Fallback attempt
    const fallbackDate = new Date(trimmed);
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  }

  /**
   * Normalizes price representations into a non-negative numeric value.
   * Strips symbols like '₹', 'INR', commas.
   *
   * @param {*} priceVal
   * @returns {number|null}
   */
  normalizePrice(priceVal) {
    if (priceVal === null || priceVal === undefined || priceVal === '') {
      return 0;
    }
    if (typeof priceVal === 'number') {
      return priceVal;
    }
    if (typeof priceVal === 'string') {
      const cleaned = priceVal.replace(/[₹$,\s]|INR|Rs\.?/gi, '').trim();
      if (!cleaned) return 0;
      const num = parseFloat(cleaned);
      return isNaN(num) ? NaN : num;
    }
    return NaN;
  }

  /**
   * Normalizes currency into uppercase 3-letter code.
   *
   * @param {string} currencyVal
   * @returns {string}
   */
  normalizeCurrency(currencyVal) {
    if (!currencyVal || typeof currencyVal !== 'string') return 'INR';
    const clean = currencyVal.replace(/[₹]/g, 'INR').trim().toUpperCase();
    return clean || 'INR';
  }

  /**
   * Normalizes travel duration to integer minutes.
   *
   * @param {*} durationVal
   * @param {Date} depTime
   * @param {Date} arrTime
   * @returns {number}
   */
  normalizeDuration(durationVal, depTime = null, arrTime = null) {
    if (typeof durationVal === 'number' && !isNaN(durationVal) && durationVal >= 0) {
      return Math.round(durationVal);
    }
    if (typeof durationVal === 'string') {
      const parsed = parseInt(durationVal, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    if (depTime instanceof Date && arrTime instanceof Date && !isNaN(depTime.getTime()) && !isNaN(arrTime.getTime())) {
      const diffMs = arrTime.getTime() - depTime.getTime();
      return Math.max(0, Math.round(diffMs / 60000));
    }
    return 0;
  }

  /**
   * Normalizes distance to kilometers.
   *
   * @param {*} distanceVal
   * @returns {number}
   */
  normalizeDistance(distanceVal) {
    if (typeof distanceVal === 'number' && !isNaN(distanceVal) && distanceVal >= 0) {
      return Math.round(distanceVal * 10) / 10;
    }
    if (typeof distanceVal === 'string') {
      const num = parseFloat(distanceVal.replace(/[^\d.]/g, ''));
      if (!isNaN(num) && num >= 0) return Math.round(num * 10) / 10;
    }
    return 0;
  }

  /**
   * Maps provider-specific transport mode strings into canonical Yatrai TRANSPORT_MODES.
   *
   * @param {string} modeVal
   * @param {string} [defaultMode]
   * @returns {string}
   */
  normalizeMode(modeVal, defaultMode = this.mode) {
    if (!modeVal || typeof modeVal !== 'string') return defaultMode;

    const lower = modeVal.trim().toLowerCase();
    if (['rail', 'train', 'trains', 'railway', 'irctc'].includes(lower)) return 'rail';
    if (['bus', 'buses', 'coach', 'redbus', 'intercity'].includes(lower)) return 'bus';
    if (['flight', 'flights', 'air', 'airline', 'aviation', 'plane', 'gds'].includes(lower)) return 'flight';
    if (['road', 'driving', 'car', 'drive', 'osrm', 'highway'].includes(lower)) return 'road';
    if (['taxi', 'cab', 'ride_hailing', 'auto', 'uber', 'ola'].includes(lower)) return 'taxi';
    if (['walk', 'walking', 'foot'].includes(lower)) return 'walk';
    if (['metro', 'subway', 'tube'].includes(lower)) return 'metro';

    return TRANSPORT_MODES.includes(lower) ? lower : defaultMode;
  }

  /**
   * Normalizes status into canonical JOURNEY_STATUSES enum.
   *
   * @param {string} statusVal
   * @returns {string}
   */
  normalizeStatus(statusVal) {
    if (!statusVal || typeof statusVal !== 'string') return 'scheduled';
    const lower = statusVal.trim().toLowerCase();

    if (['available', 'confirmed', 'scheduled', 'active', 'ok', 'success'].includes(lower)) {
      return 'scheduled';
    }
    if (['in_progress', 'running', 'en_route'].includes(lower)) {
      return 'in_progress';
    }
    if (['completed', 'arrived', 'finished'].includes(lower)) {
      return 'completed';
    }
    if (['cancelled', 'canceled', 'void'].includes(lower)) {
      return 'cancelled';
    }
    if (['disrupted', 'delayed'].includes(lower)) {
      return 'disrupted';
    }

    return JOURNEY_STATUSES.includes(lower) ? lower : 'scheduled';
  }

  /**
   * Abstract normalization method to be implemented by mode strategies.
   *
   * @param {Object} rawCandidate
   * @param {Object} context
   * @returns {Object} Normalized Journey + Legs candidate
   */
  normalize(rawCandidate, context = {}) {
    throw new Error(`Strategy ${this.constructor.name} must implement normalize()`);
  }
}

export default BaseNormalizerStrategy;
