import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJourneyStages, resolveStation } from '../client/src/utils/journeyParser.js';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  getDayOffset,
  formatDayOffsetBadge,
  getPriceLabel,
  getRecommendationExplanation,
} from '../client/src/utils/formatters.js';
import { toJourneyViewModel } from '../client/src/utils/journeyViewModel.js';

describe('ResultCard & Show Details Page/Modal Integration Tests', () => {
  it('1. formatDuration safely handles strings, numbers, and pre-formatted text', () => {
    assert.equal(formatDuration(null), '0m');
    assert.equal(formatDuration(undefined), '0m');
    assert.equal(formatDuration(0), '0m');
    assert.equal(formatDuration(710), '11h 50m');
    assert.equal(formatDuration('710'), '11h 50m');
    assert.equal(formatDuration('11h 50m'), '11h 50m');
    assert.equal(formatDuration('2h'), '2h');
    assert.equal(formatDuration('45m'), '45m');
  });

  it('2. getDayOffset accurately calculates day offsets across dates, times, and durations', () => {
    // Timestamp calendar day offset
    assert.equal(getDayOffset('2026-10-31T14:10:00Z', '2026-11-01T17:23:00Z'), 1);
    assert.equal(getDayOffset('2026-10-31T14:10:00Z', '2026-10-31T17:23:00Z', 1633), 1);

    // Time-only strings (e.g. 16:50 -> 04:40)
    assert.equal(getDayOffset('16:50', '04:40'), 1);
    assert.equal(getDayOffset('19:40', '22:53', 1633), 1);
    assert.equal(getDayOffset('06:00', '18:00', 720), 0);

    // Day offset badge formatter
    assert.equal(formatDayOffsetBadge(0), null);
    assert.equal(formatDayOffsetBadge(1), '+1 day');
    assert.equal(formatDayOffsetBadge(2), '+2 days');
  });

  it('3. parseJourneyStages synthesizes direct rail leg when journey.legs is empty', () => {
    const directJourney = {
      id: '12310',
      trainNumber: '12310',
      trainName: 'Patna Rajdhani',
      from: 'NDLS',
      to: 'PNBE',
      departureTime: '17:10',
      arrivalTime: '05:15',
      duration: 725,
      totalPrice: 1850,
      isDirectTrain: true,
      pricing: { totalFare: 1850 },
      classes: [{ class: '3A', state: 'CHECKED', tier: 'AVAILABLE', fare: 1850 }],
    };

    const parsed = parseJourneyStages(directJourney);
    assert.ok(parsed);
    assert.equal(parsed.stagesList.length, 1);
    assert.equal(parsed.trainStages.length, 1);
    assert.equal(parsed.trainStage.trainName, 'Patna Rajdhani');
    assert.equal(parsed.trainStage.trainNumber, '12310');
    assert.equal(parsed.trainStage.departureTime, '17:10');
    assert.equal(parsed.trainStage.arrivalTime, '05:15');
    assert.equal(parsed.trainStage.dayOffset, 1);
    assert.equal(parsed.trainStage.fare, 1850);
    assert.equal(parsed.costs.trainFare, 1850);
    assert.equal(parsed.costs.hasMissingCosts, false);
  });

  it('4. toJourneyViewModel builds consistent view models with populated legs', () => {
    const raw = {
      direct: [
        {
          trainNumber: '12302',
          trainName: 'Kolkata Rajdhani',
          from: 'NDLS',
          to: 'PNBE',
          departureTime: '16:50',
          arrivalTime: '04:40',
          duration: 710,
          classes: [{ class: '3A', state: 'CHECKED', tier: 'AVAILABLE', fare: 1750 }],
        },
      ],
    };

    const vms = toJourneyViewModel(raw);
    assert.equal(vms.length, 1);
    assert.ok(Array.isArray(vms[0].legs));
    assert.equal(vms[0].legs.length, 1);
    assert.equal(vms[0].legs[0].service.number, '12302');
    assert.equal(vms[0].legs[0].service.name, 'Kolkata Rajdhani');
    assert.equal(vms[0].legs[0].price, 1750);

    const parsed = parseJourneyStages(vms[0]);
    assert.equal(parsed.trainStages.length, 1);
    assert.equal(parsed.trainStage.trainNumber, '12302');
    assert.equal(parsed.trainStage.dayOffset, 1);
    assert.equal(parsed.costs.trainFare, 1750);
  });

  it('5. Price fallbacks resolve total fare without displaying "Fare unavailable"', () => {
    const journeyWithNestedPricing = {
      id: 'test-fare',
      trainNumber: '12345',
      trainName: 'Test Express',
      pricing: { totalFare: 1200 },
      origin: { name: 'Origin' },
      destination: { name: 'Destination' },
    };

    const parsed = parseJourneyStages(journeyWithNestedPricing);
    assert.equal(parsed.costs.trainFare, 1200);

    const rawPrice =
      journeyWithNestedPricing.totalPrice ??
      journeyWithNestedPricing.pricing?.totalFare ??
      journeyWithNestedPricing.fare ??
      journeyWithNestedPricing.price ??
      parsed?.costs?.knownCostSum ??
      null;

    assert.equal(rawPrice, 1200);
    const formatted = formatPrice(rawPrice, 'INR');
    assert.ok(formatted.includes('1,200') || formatted.includes('1200'));
    assert.ok(!formatted.includes('unavailable'));
  });
});
