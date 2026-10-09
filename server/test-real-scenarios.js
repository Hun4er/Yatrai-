async function runScenarios() {
  const BASE_URL = 'http://localhost:5000/api';
  console.log('=== YATRAI PHASE 22: RUNNING 10 REAL SEARCH SCENARIOS ===\n');

  const scenarios = [
    {
      id: 1,
      name: 'Chennai -> Patna Junction (Metropolitan cluster & direct road)',
      body: { origin: 'Chennai', destination: 'Patna Junction', departureDate: '2026-10-01' },
      expected: (res) => res.success && res.data.journeys.length > 0 && res.data.journeys.some(j => j.transportModes.includes('rail')) && res.data.journeys.some(j => j.transportModes.includes('road')),
    },
    {
      id: 2,
      name: 'Delhi -> Patna (Major rail corridor)',
      body: { origin: 'Delhi', destination: 'Patna', departureDate: '2026-10-01' },
      expected: (res) => res.success && res.data.journeys.length > 0 && res.data.journeys.some(j => j.transportModes.includes('rail')),
    },
    {
      id: 3,
      name: 'Sonipat -> Patna Junction (Multi-modal Road + Rail & Direct Road)',
      body: { origin: 'Sonipat', destination: 'Patna Junction', departureDate: '2026-10-01' },
      expected: (res) => res.success && res.data.journeys.some(j => j.numberOfTransfers === 1 && j.transportModes.includes('road') && j.transportModes.includes('rail')),
    },
    {
      id: 4,
      name: 'Delhi -> Mumbai (High frequency trunk route)',
      body: { origin: 'New Delhi', destination: 'Mumbai', departureDate: '2026-10-01' },
      expected: (res) => res.success && res.data.journeys.length > 0,
    },
    {
      id: 5,
      name: 'Chennai -> Bangalore (Short-haul intercity)',
      body: { origin: 'Chennai', destination: 'Bangalore', departureDate: '2026-10-01' },
      expected: (res) => res.success && res.data.journeys.length > 0 && res.data.journeys.some(j => j.transportModes.includes('rail')),
    },
    {
      id: 6,
      name: 'Patna -> Delhi (Return corridor)',
      body: { origin: 'Patna', destination: 'Delhi', departureDate: '2026-10-01' },
      expected: (res) => res.success && res.data.journeys.length > 0,
    },
    {
      id: 7,
      name: 'Mumbai -> Bangalore (South-West corridor)',
      body: { origin: 'Mumbai', destination: 'Bangalore', departureDate: '2026-10-01' },
      expected: (res) => res.success && res.data.journeys.length > 0,
    },
    {
      id: 8,
      name: 'Negative: Origin === Destination (Chennai -> Chennai)',
      body: { origin: 'Chennai', destination: 'Chennai', departureDate: '2026-10-01' },
      expectedStatus: 400,
      expected: (res, status) => status === 400 || (res.success === false && /same/i.test(res.message || res.error || '')),
    },
    {
      id: 9,
      name: 'Negative: Unknown Location (Xyz1234NonExistent -> Patna)',
      body: { origin: 'Xyz1234NonExistent', destination: 'Patna', departureDate: '2026-10-01' },
      expectedStatus: 404,
      expected: (res, status) => status === 404 || res.success === false,
    },
    {
      id: 10,
      name: 'Negative: Past Date (2020-01-01)',
      body: { origin: 'Chennai', destination: 'Patna', departureDate: '2020-01-01' },
      expectedStatus: 400,
      expected: (res, status) => status === 400 || (res.success === false && /past/i.test(res.message || res.error || '')),
    },
  ];

  let passed = 0;

  for (const s of scenarios) {
    const start = Date.now();
    try {
      const resp = await fetch(`${BASE_URL}/journeys/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s.body),
      });

      const data = await resp.json();
      const elapsed = Date.now() - start;
      const isOk = s.expected(data, resp.status);

      if (isOk) {
        passed++;
        console.log(`[PASS] Scenario ${s.id}: ${s.name} (${elapsed}ms)`);
        if (data.data?.journeys?.length > 0) {
          const modes = [...new Set(data.data.journeys.flatMap(j => j.transportModes))].join(', ');
          console.log(`       Found ${data.data.journeys.length} journeys [Modes: ${modes}]`);
        } else if (resp.status >= 400) {
          console.log(`       Correctly rejected with HTTP ${resp.status}: ${data.message || data.error}`);
        }
      } else {
        console.log(`[FAIL] Scenario ${s.id}: ${s.name} (${elapsed}ms)`);
        console.log(`       Status: ${resp.status}, Response:`, JSON.stringify(data).slice(0, 150));
      }
    } catch (err) {
      console.log(`[ERROR] Scenario ${s.id}: ${s.name} - ${err.message}`);
    }
  }

  console.log(`\n=== SCENARIO SUMMARY: ${passed}/${scenarios.length} PASSED ===`);

  // Provider health check verification
  console.log('\n=== CHECKING PROVIDER HEALTH API (GET /api/providers/health) ===');
  const healthResp = await fetch(`${BASE_URL}/providers/health`);
  const healthData = await healthResp.json();
  console.log(`Health API Status: HTTP ${healthResp.status} -> Overall: ${healthData.data?.status}`);
  healthData.data?.providers?.forEach(p => {
    console.log(`  - [${p.mode.toUpperCase()}] ${p.provider}: ${p.status} (latency: ${p.latencyMs || 'N/A'}ms, bookable: ${p.bookable})`);
  });
}

runScenarios();
