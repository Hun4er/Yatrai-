async function main() {
  const res = await fetch('http://localhost:5000/api/journeys/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'Delhi',
      destination: 'Patna',
      departureDate: '2026-10-01'
    })
  });

  const parsed = await res.json();
  const journeys = parsed.data?.journeys || parsed.journeys || [];
  console.log('Total journeys returned:', journeys.length);

  const direct = journeys.filter(j => j.numberOfTransfers === 0);
  const multimodal = journeys.filter(j => j.numberOfTransfers > 0);
  console.log('Direct journeys count:', direct.length);
  console.log('Multi-modal journeys count:', multimodal.length);

  journeys.slice(0, 15).forEach((j, i) => {
    const modes = (j.legs || []).map(l => `${l.mode} (${l.origin?.name || l.origin?.displayName || 'Origin'} -> ${l.destination?.name || l.destination?.displayName || 'Destination'})`).join('  -->  ');
    const price = j.totalPrice ?? j.pricing?.totalPrice?.amount ?? j.pricing?.amount;
    const isEstimated = j.metadata?.isEstimatedPrice || j.pricing?.containsEstimatedComponents || false;
    const typeLabel = j.numberOfTransfers > 0 ? 'MULTI_MODAL' : 'DIRECT';

    console.log(`\n[#${i+1}] [${typeLabel}] Transfers: ${j.numberOfTransfers} | Duration: ${j.duration}m | Fare: ₹${price} (est: ${isEstimated})`);
    console.log(`     Route: ${modes}`);
  });
}

main().catch(console.error);
