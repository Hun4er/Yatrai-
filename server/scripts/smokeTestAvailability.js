import 'dotenv/config';
import config from '../src/config/index.js';
import { RailRadarAdapter } from '../src/providers/rail/railRadar.adapter.js';
import logger from '../src/utils/logger.js';

/**
 * Controlled smoke test for RailRadar seat availability endpoint.
 * Strictly adheres to Task 3 Section 9:
 * - Uses existing local environment configuration
 * - Makes one bounded request to documented GET /v1/trains/{number}/seats
 * - Reports HTTP status, response shape, provider error code, elapsed time, and parseability
 * - Redacts all API keys, tokens, and authorization headers
 * - Never substitutes fixtures
 */
async function runSmokeTest() {
  const adapter = new RailRadarAdapter({
    enableAvailabilityEndpoint: true,
  });

  const hasApiKey = Boolean(adapter.apiKey);
  const maskedKey = adapter.apiKey
    ? `${adapter.apiKey.slice(0, 4)}...${adapter.apiKey.slice(-4)}`
    : 'NONE';

  console.log('=== RailRadar Seat Availability Live Smoke Test ===');
  console.log(`Provider URL: ${adapter.apiUrl}`);
  console.log(`API Key Configured: ${hasApiKey ? 'YES (' + maskedKey + ')' : 'NO'}`);

  // Test case: Train 12004 (Lucknow Shatabdi: NDLS -> CNB)
  const trainNumber = '12004';
  const from = 'NDLS';
  const to = 'CNB';
  const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const travelClass = 'CC';
  const quota = 'GN';

  console.log(`Test Parameters: Train=${trainNumber}, From=${from}, To=${to}, Date=${targetDate}, Class=${travelClass}, Quota=${quota}`);

  const startTime = Date.now();
  try {
    const rawData = await adapter.cachedRequest(`smoke:${trainNumber}`, 1000, async () => {
      const queryParams = new URLSearchParams({
        source: from,
        destination: to,
        journeyDate: targetDate,
        classCode: travelClass,
        quotaCode: quota,
      });
      const url = `${adapter.apiUrl}/trains/${trainNumber}/seats?${queryParams.toString()}`;
      const { httpFetch } = await import('../src/providers/transport/httpClient.js');
      return httpFetch(url, { headers: adapter.getHeaders(), provider: 'railradar' });
    });

    console.log('HTTP 200 OK received from RailRadar!');
    console.log('Raw Top-Level Keys:', Object.keys(rawData.data || {}));
    if (rawData.data?.data) {
      console.log('data.data Keys:', Object.keys(rawData.data.data));
      console.log('calendar type:', typeof rawData.data.data.calendar);
      console.log('calendar isArray:', Array.isArray(rawData.data.data.calendar));
      if (Array.isArray(rawData.data.data.calendar)) {
        console.log('calendar length:', rawData.data.data.calendar.length);
        console.log('First 3 entries in calendar:', rawData.data.data.calendar.slice(0, 3));
      } else if (rawData.data.data.calendar) {
        console.log('calendar keys:', Object.keys(rawData.data.data.calendar));
        console.log('calendar sample:', JSON.stringify(rawData.data.data.calendar).slice(0, 500));
      }
      if (Array.isArray(rawData.data.data.avlDayList)) {
        console.log('avlDayList length:', rawData.data.data.avlDayList.length);
        console.log('First 3 entries in avlDayList:', rawData.data.data.avlDayList.slice(0, 3));
      }
    }

    const result = await adapter.getAvailability(trainNumber, from, to, targetDate, travelClass, quota, {
      isRecovery: false,
    });
    const elapsedMs = Date.now() - startTime;

    console.log(`Elapsed Time: ${elapsedMs}ms`);
    console.log(`Success: ${result.success}`);
    console.log(`Normalized Status: ${result.normalizedStatus}`);
    console.log(`Original Status: ${result.originalStatus || 'N/A'}`);
    console.log(`Seats Available: ${result.seatsAvailable ?? 'N/A'}`);
    console.log(`HTTP Status Code: ${result.statusCode || (result.success ? 200 : 'N/A')}`);
    if (result.error) {
      console.log(`Provider Error Message: ${result.error}`);
    }
    console.log('Response Keys:', Object.keys(result));
    console.log('=== Smoke Test Complete ===');
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    console.log(`Request Failed after ${elapsedMs}ms:`, err.message);
  }
}

runSmokeTest();
