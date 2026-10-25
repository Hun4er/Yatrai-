import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedData,
  setCachedData,
  removeCachedData,
  clearExpiredCache,
  clearApplicationCache,
  staleWhileRevalidate,
  getLocalRecentSearches,
  saveLocalRecentSearch,
  removeLocalRecentSearch,
  clearLocalRecentSearches,
} from '../src/utils/browserCache.js';

describe('Frontend Browser Cache Utility Suite', () => {
  beforeEach(() => {
    clearApplicationCache();
    clearLocalRecentSearches();
  });

  it('stores and retrieves cached data with versioned envelope', () => {
    setCachedData('test_key', { foo: 'bar' }, 60000);
    const retrieved = getCachedData('test_key');
    assert.deepEqual(retrieved, { foo: 'bar' });
  });

  it('returns null for non-existent or expired keys', async () => {
    assert.equal(getCachedData('non_existent'), null);

    // Set with 1ms TTL
    setCachedData('exp_key', { val: 123 }, 1);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(getCachedData('exp_key'), null);
  });

  it('removes cached keys on demand', () => {
    setCachedData('del_key', { a: 1 }, 60000);
    removeCachedData('del_key');
    assert.equal(getCachedData('del_key'), null);
  });

  it('never stores Error objects or error status', () => {
    setCachedData('err_key', new Error('Something failed'), 60000);
    assert.equal(getCachedData('err_key'), null);

    setCachedData('err_status', { status: 'error', message: 'Failed' }, 60000);
    assert.equal(getCachedData('err_status'), null);
  });

  it('executes staleWhileRevalidate correctly', async () => {
    let fetchCount = 0;
    const fetchFn = async () => {
      fetchCount++;
      return { count: fetchCount };
    };

    // First call: fetches fresh
    const res1 = await staleWhileRevalidate('swr_key', fetchFn, 60000);
    assert.deepEqual(res1, { count: 1 });
    assert.equal(fetchCount, 1);

    // Second call before expiry: hits cache without calling fetchFn
    const res2 = await staleWhileRevalidate('swr_key', fetchFn, 60000);
    assert.deepEqual(res2, { count: 1 });
    assert.equal(fetchCount, 1);
  });

  it('stores visitor recent searches and deduplicates identical queries', () => {
    saveLocalRecentSearch({
      origin: 'New Delhi',
      destination: 'Patna',
      departureDate: '2026-11-12',
    });

    saveLocalRecentSearch({
      origin: 'New Delhi',
      destination: 'Patna',
      departureDate: '2026-11-12',
    });

    const list = getLocalRecentSearches();
    assert.equal(list.length, 1, 'Should not contain duplicates for identical query');
    assert.equal(list[0].origin, 'New Delhi');
    assert.equal(list[0].destination, 'Patna');

    // Add a second search
    saveLocalRecentSearch({
      origin: 'Howrah',
      destination: 'Varanasi',
      departureDate: '2026-11-14',
    });

    const list2 = getLocalRecentSearches();
    assert.equal(list2.length, 2);
    assert.equal(list2[0].origin, 'Howrah'); // most recent first

    // Remove one
    removeLocalRecentSearch(list2[0].id);
    const list3 = getLocalRecentSearches();
    assert.equal(list3.length, 1);
    assert.equal(list3[0].origin, 'New Delhi');

    // Clear all
    clearLocalRecentSearches();
    assert.equal(getLocalRecentSearches().length, 0);
  });
});
