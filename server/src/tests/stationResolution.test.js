import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveStationCode,
  STATION_CODE_MAP,
} from '../providers/transport/rail/rail.provider.js';
import {
  findStationByCode,
  findStationByName,
  searchRailwayStations,
} from '../services/rail/stationRegistry.js';
import { resolveStations } from '../controllers/journeyV2.controller.js';

describe('Station Resolution across all station formats and lengths', () => {
  it('resolves 1-letter station codes like R (Raipur) and G (Gondia)', () => {
    assert.strictEqual(resolveStationCode('R'), 'R');
    assert.strictEqual(resolveStationCode('r'), 'R');
    assert.strictEqual(resolveStationCode('G'), 'G');
    assert.strictEqual(resolveStationCode('g'), 'G');

    const raipurByCode = findStationByCode('R');
    assert.ok(raipurByCode);
    assert.strictEqual(raipurByCode.stationCode, 'R');
  });

  it('resolves station names with suffixes (Jn, Junction, Cantt, Central)', () => {
    assert.strictEqual(resolveStationCode('RAIPUR JN'), 'R');
    assert.strictEqual(resolveStationCode('Raipur Junction'), 'R');
    assert.strictEqual(resolveStationCode('raipur'), 'R');
    assert.strictEqual(resolveStationCode('Patna Jn'), 'PNBE');
    assert.strictEqual(resolveStationCode('PATNA JUNCTION'), 'PNBE');
    assert.strictEqual(resolveStationCode('Delhi Jn'), 'DLI');
    assert.strictEqual(resolveStationCode('New Delhi'), 'NDLS');
    assert.strictEqual(resolveStationCode('Kanpur Central'), 'CNB');
    assert.strictEqual(resolveStationCode('Howrah Junction'), 'HWH');
  });

  it('resolves formatted display names with hyphen or parenthesis', () => {
    assert.strictEqual(resolveStationCode('RAIPUR JN - R'), 'R');
    assert.strictEqual(resolveStationCode('NEW DELHI - NDLS'), 'NDLS');
    assert.strictEqual(resolveStationCode('New Delhi (NDLS)'), 'NDLS');
    assert.strictEqual(resolveStationCode('PATNA JN - PNBE'), 'PNBE');
    assert.strictEqual(resolveStationCode('MUMBAI CENTRAL - MMCT'), 'MMCT');
    assert.strictEqual(resolveStationCode('HOWRAH JN - HWH'), 'HWH');
  });

  it('resolves city names that might look like station codes (e.g. PATNA, DELHI, SURAT)', () => {
    // City names shouldn't be treated as verbatim codes unless they match actual code
    assert.strictEqual(resolveStationCode('PATNA'), 'PNBE');
    assert.strictEqual(resolveStationCode('patna'), 'PNBE');
    assert.strictEqual(resolveStationCode('DELHI'), 'NDLS');
    assert.strictEqual(resolveStationCode('delhi'), 'NDLS');
  });

  it('resolves station objects with stationCode, code, or name', () => {
    assert.strictEqual(resolveStationCode({ stationCode: 'R' }), 'R');
    assert.strictEqual(resolveStationCode({ code: 'R' }), 'R');
    assert.strictEqual(resolveStationCode({ name: 'RAIPUR JN' }), 'R');
    assert.strictEqual(resolveStationCode({ displayName: 'RAIPUR JN - R' }), 'R');
    assert.strictEqual(resolveStationCode({ name: 'NEW DELHI', stationCode: 'NDLS' }), 'NDLS');
  });

  it('searchRailwayStations finds stations by formatted query', () => {
    const resFormatted = searchRailwayStations('RAIPUR JN - R', 5);
    assert.ok(resFormatted.length > 0, 'Should find stations for RAIPUR JN - R');
    assert.strictEqual(resFormatted[0].stationCode, 'R');

    const resName = searchRailwayStations('Raipur', 5);
    assert.ok(resName.length > 0);
    assert.strictEqual(resName[0].stationCode, 'R');

    const resCode = searchRailwayStations('R', 5);
    assert.ok(resCode.length > 0);
    assert.strictEqual(resCode[0].stationCode, 'R');
  });

  it('findStationByName finds stations accurately', () => {
    const s1 = findStationByName('RAIPUR JN');
    assert.ok(s1);
    assert.strictEqual(s1.stationCode, 'R');

    const s2 = findStationByName('RAIPUR JN - R');
    assert.ok(s2);
    assert.strictEqual(s2.stationCode, 'R');

    const s3 = findStationByName('NEW DELHI');
    assert.ok(s3);
    assert.strictEqual(s3.stationCode, 'NDLS');
  });

  it('journeyV2 resolveStations resolves all inputs correctly', async () => {
    const r1 = await resolveStations(['RAIPUR JN']);
    assert.deepStrictEqual(r1, ['R']);

    const r2 = await resolveStations(['RAIPUR JN - R']);
    assert.deepStrictEqual(r2, ['R']);

    const r3 = await resolveStations(['R']);
    assert.deepStrictEqual(r3, ['R']);

    const r4 = await resolveStations(['NEW DELHI - NDLS']);
    assert.deepStrictEqual(r4, ['NDLS']);

    const r5 = await resolveStations(['PATNA']);
    assert.deepStrictEqual(r5, ['PNBE']);

    const r6 = await resolveStations([{ stationCode: 'R', name: 'RAIPUR JN' }]);
    assert.deepStrictEqual(r6, ['R']);

    const r7 = await resolveStations([{ name: 'RAIPUR JN' }]);
    assert.deepStrictEqual(r7, ['R']);

    const r8 = await resolveStations(['GONDIA JN - G']);
    assert.deepStrictEqual(r8, ['G']);
  });
});
