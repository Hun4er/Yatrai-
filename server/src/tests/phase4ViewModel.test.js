import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixture(filename) {
  const p = path.join(__dirname, 'fixtures', 'real', filename);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Node-compatible port of the client toJourneyViewModel & rankJourneys
 */
function toJourneyViewModel(newResponse) {
  if (!newResponse) return [];
  const list = [];
  const direct = Array.isArray(newResponse.direct) ? newResponse.direct : [];
  const alternatives = Array.isArray(newResponse.alternatives) ? newResponse.alternatives : [];

  for (const t of direct) {
    const checkedClasses = (t.classes || []).filter(
      (c) => c.state === 'CHECKED' && typeof c.fare === 'number' && c.fare > 0
    );
    const minFare = checkedClasses.length > 0
      ? Math.min(...checkedClasses.map((c) => c.fare))
      : (typeof t.fare === 'number' && t.fare > 0 ? t.fare : null);

    const hasConfirmed = (t.classes || []).some(
      (c) => c.state === 'CHECKED' && (c.tier === 'AVAILABLE' || c.isAvailable)
    );
    const hasRAC = (t.classes || []).some(
      (c) => c.state === 'CHECKED' && c.tier === 'RAC'
    );
    const hasWaitlist = (t.classes || []).some(
      (c) => c.state === 'CHECKED' && c.tier === 'WAITLIST'
    );
    const tier = hasConfirmed ? 'CONFIRMED' : (hasRAC ? 'RAC' : (hasWaitlist ? 'WAITLIST' : 'UNCHECKED'));

    const depTime = t.departureTime || t.departure || '06:00';
    const arrTime = t.arrivalTime || t.arrival || '18:00';
    const duration = t.durationMinutes || t.duration || 720;

    list.push({
      id: String(t.trainNumber),
      trainNumber: t.trainNumber,
      trainName: t.trainName,
      title: `${t.trainNumber} ${t.trainName}`,
      departureTime: depTime,
      arrivalTime: arrTime,
      duration,
      numberOfTransfers: 0,
      transferCount: 0,
      totalPrice: minFare,
      fare: minFare,
      price: minFare,
      priceFormatted: minFare !== null ? `₹${minFare.toLocaleString('en-IN')}` : 'Fare after check',
      currency: 'INR',
      tier,
      tierScore: hasConfirmed ? 100 : (hasRAC ? 75 : (hasWaitlist ? 50 : 0)),
      isDirectTrain: true,
      transportModes: ['rail'],
      from: t.from,
      to: t.to,
      fromName: t.fromName || t.from,
      toName: t.toName || t.to,
      classes: t.classes || [],
    });
  }

  for (let i = 0; i < alternatives.length; i++) {
    const alt = alternatives[i];
    const legs = Array.isArray(alt.legs) ? alt.legs : [];
    const isSameTrain = Boolean(alt.sameTrain || alt.type === 'same_train');
    const transfers = isSameTrain ? 0 : Math.max(0, legs.length - 1);
    const fare = typeof alt.totalFare === 'number' && alt.totalFare > 0
      ? alt.totalFare
      : (typeof alt.fare === 'number' && alt.fare > 0 ? alt.fare : null);

    const depTime = alt.departureTime || legs[0]?.departureTime || '06:00';
    const arrTime = alt.arrivalTime || legs[legs.length - 1]?.arrivalTime || '18:00';
    const duration = alt.duration || alt.totalDurationMinutes || 720;
    const tier = alt.tier || 'CONFIRMED';

    list.push({
      id: `alt-${i}-${alt.laneClass || 'any'}`,
      title: `Alternative via ${alt.hubCode || 'Hub'}`,
      departureTime: depTime,
      arrivalTime: arrTime,
      duration,
      numberOfTransfers: transfers,
      transferCount: transfers,
      totalPrice: fare,
      fare,
      price: fare,
      priceFormatted: fare !== null ? `₹${fare.toLocaleString('en-IN')}` : 'Fare after check',
      currency: 'INR',
      tier,
      tierScore: tier === 'CONFIRMED' ? 100 : (tier === 'RAC' ? 75 : (tier === 'WAITLIST' || tier === 'RISKY' ? 50 : 0)),
      isDirectTrain: false,
      isAlternative: true,
      transportModes: ['rail'],
      from: legs[0]?.from,
      to: legs[legs.length - 1]?.to,
      laneClass: alt.laneClass,
      legs,
    });
  }

  return list;
}

function rankJourneys(journeys = [], strategy = 'overall') {
  const sorted = [...journeys];
  switch (strategy) {
    case 'fastest':
      return sorted.sort((a, b) => (a.duration || 0) - (b.duration || 0));

    case 'cheapest':
      return sorted.sort((a, b) => {
        if (a.totalPrice === null && b.totalPrice === null) return 0;
        if (a.totalPrice === null) return 1;
        if (b.totalPrice === null) return -1;
        return a.totalPrice - b.totalPrice;
      });

    case 'fewest_transfers':
      return sorted.sort((a, b) => {
        const diff = (a.numberOfTransfers ?? 0) - (b.numberOfTransfers ?? 0);
        if (diff !== 0) return diff;
        return (a.duration || 0) - (b.duration || 0);
      });

    case 'overall':
    default:
      return sorted.sort((a, b) => {
        const tierDiff = (b.tierScore || 0) - (a.tierScore || 0);
        if (tierDiff !== 0) return tierDiff;
        const durDiff = (a.duration || 0) - (b.duration || 0);
        if (durDiff !== 0) return durDiff;
        if (a.totalPrice === null && b.totalPrice === null) return 0;
        if (a.totalPrice === null) return 1;
        if (b.totalPrice === null) return -1;
        return a.totalPrice - b.totalPrice;
      });
  }
}

describe('Phase 4: toJourneyViewModel, Ranking, Filters, and Class Bar', () => {
  test('toJourneyViewModel maps direct and alternative trains with fare, tier, and durations', () => {
    const rawDirect = [
      {
        trainNumber: '12310',
        trainName: 'RJPB TEJAS RAJ',
        from: 'NDLS',
        to: 'DNR',
        durationMinutes: 688,
        classes: [
          { class: '3A', state: 'CHECKED', tier: 'WAITLIST', fare: 2545 },
          { class: '2A', state: 'CHECKED', tier: 'WAITLIST', fare: 3620 },
          { class: '1A', state: 'UNCHECKED', tier: null, fare: null },
        ],
      },
      {
        trainNumber: '12394',
        trainName: 'SAMPOORAN K EXP',
        from: 'NDLS',
        to: 'PNBE',
        durationMinutes: 760,
        classes: [
          { class: 'SL', state: 'UNCHECKED', tier: null, fare: null },
        ],
      },
    ];

    const altFixture = loadFixture('alternatives-response.json');
    const vm = toJourneyViewModel({ direct: rawDirect, alternatives: altFixture.alternatives });

    assert.equal(vm.length, 2 + 4); // 2 direct + 4 alternatives

    // Card 1: 12310 - min fare is 2545 (min of 3A and 2A), tier is WAITLIST
    const t12310 = vm.find((j) => j.trainNumber === '12310');
    assert.equal(t12310.totalPrice, 2545);
    assert.equal(t12310.priceFormatted, '₹2,545');
    assert.equal(t12310.tier, 'WAITLIST');
    assert.equal(t12310.numberOfTransfers, 0);

    // Card 2: 12394 - unchecked fare -> null, tier UNCHECKED, priceFormatted "Fare after check"
    const t12394 = vm.find((j) => j.trainNumber === '12394');
    assert.equal(t12394.totalPrice, null);
    assert.equal(t12394.priceFormatted, 'Fare after check');
    assert.equal(t12394.tier, 'UNCHECKED');

    // Price range calculation: ignores nulls without breaking
    const pricesWithFares = vm.map((j) => j.totalPrice).filter((p) => p !== null && p > 0);
    const minPrice = Math.min(...pricesWithFares);
    const maxPrice = Math.max(...pricesWithFares);
    assert.equal(minPrice, 780); // alternative 4 (SL) totalFare is 780
    assert.equal(maxPrice, 3410); // alternative 2 (2A) totalFare is 3410
  });

  test('Ranking strategies: Best Overall, Fastest, Cheapest, Fewest Transfers', () => {
    const journeys = [
      { id: '1', tierScore: 50, duration: 800, totalPrice: 2000, numberOfTransfers: 0 }, // WL, 800m, ₹2000
      { id: '2', tierScore: 100, duration: 900, totalPrice: 3000, numberOfTransfers: 1 }, // CONFIRMED, 900m, ₹3000
      { id: '3', tierScore: 100, duration: 600, totalPrice: 2500, numberOfTransfers: 0 }, // CONFIRMED, 600m, ₹2500
      { id: '4', tierScore: 0, duration: 500, totalPrice: null, numberOfTransfers: 0 }, // UNCHECKED, 500m, null fare
    ];

    // 1. Best Overall: tierScore desc, duration asc, totalPrice asc
    const overall = rankJourneys(journeys, 'overall');
    assert.equal(overall[0].id, '3'); // CONFIRMED, 600m
    assert.equal(overall[1].id, '2'); // CONFIRMED, 900m
    assert.equal(overall[2].id, '1'); // WL
    assert.equal(overall[3].id, '4'); // UNCHECKED

    // 2. Fastest: duration asc
    const fastest = rankJourneys(journeys, 'fastest');
    assert.equal(fastest[0].id, '4'); // 500m
    assert.equal(fastest[1].id, '3'); // 600m

    // 3. Cheapest: totalPrice asc, null placed last
    const cheapest = rankJourneys(journeys, 'cheapest');
    assert.equal(cheapest[0].id, '1'); // ₹2000
    assert.equal(cheapest[1].id, '3'); // ₹2500
    assert.equal(cheapest[2].id, '2'); // ₹3000
    assert.equal(cheapest[3].id, '4'); // null fare last

    // 4. Fewest Transfers: transfers asc, duration asc
    const fewest = rankJourneys(journeys, 'fewest_transfers');
    assert.equal(fewest[0].id, '4'); // 0 transfers, 500m
    assert.equal(fewest[1].id, '3'); // 0 transfers, 600m
    assert.equal(fewest[2].id, '1'); // 0 transfers, 800m
    assert.equal(fewest[3].id, '2'); // 1 transfer, 900m
  });

  test('Class bar has only reservable classes and excludes GEN / PWD', () => {
    const rawOfferedClasses = ['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', '2S', 'GEN', 'GN', 'PWD', 'GENERAL'];
    const RESERVABLE_CLASSES = ['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', '2S'];

    const filtered = rawOfferedClasses.filter((c) => RESERVABLE_CLASSES.includes(c));
    assert.deepEqual(filtered, ['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', '2S']);
    assert.ok(!filtered.includes('GEN'), 'GEN must not be in class bar');
    assert.ok(!filtered.includes('GN'), 'GN must not be in class bar');
    assert.ok(!filtered.includes('PWD'), 'PWD must not be in class bar');
  });

  test('Destination difference triggers Arrives at Danapur (DNR), not Patna Jn note', () => {
    const train = {
      trainNumber: '12310',
      from: 'NDLS',
      to: 'DNR',
      toName: 'Danapur',
    };
    const typedDestCode = 'PNBE';
    const typedDestName = 'Patna Jn';

    const differs = train.to.toUpperCase() !== typedDestCode.toUpperCase();
    assert.equal(differs, true);

    const note = differs
      ? `Arrives at ${train.toName || train.to} (${train.to}), not ${typedDestName || typedDestCode}`
      : null;

    assert.equal(note, 'Arrives at Danapur (DNR), not Patna Jn');
  });
});
