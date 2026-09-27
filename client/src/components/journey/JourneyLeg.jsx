import React from 'react';
import { Train, Bus, Plane, Car, Footprints, Clock, ArrowRight } from 'lucide-react';

/**
 * Format minutes into "Xh Ym" or "Xh"
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

/**
 * Format ISO time into HH:mm
 */
function formatTime(isoString) {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

/**
 * Returns appropriate icon for transport mode
 */
export function getModeIcon(mode) {
  const normalized = (mode || '').toLowerCase();
  switch (normalized) {
    case 'rail':
    case 'train':
      return Train;
    case 'bus':
      return Bus;
    case 'flight':
    case 'air':
      return Plane;
    case 'road':
    case 'car':
    case 'taxi':
    case 'cab':
      return Car;
    case 'walk':
      return Footprints;
    default:
      return Train;
  }
}

/**
 * JourneyLeg Component
 *
 * Renders an individual journey leg timeline item and transfer interval.
 */
export function JourneyLeg({ leg, isLast = false, nextLeg = null }) {
  const Icon = getModeIcon(leg.mode);

  const originName = leg.origin?.name || leg.origin?.city || 'Origin';
  const destinationName = leg.destination?.name || leg.destination?.city || 'Destination';
  const depTime = formatTime(leg.departureTime);
  const arrTime = formatTime(leg.arrivalTime);
  const durationText = formatDuration(leg.duration);
  const serviceName =
    leg.service?.name ||
    leg.service?.operator ||
    leg.vehicle?.type ||
    (leg.mode ? leg.mode.toUpperCase() : 'Transit');

  // Calculate transfer duration between this leg and the next leg
  let transferDuration = 0;
  if (nextLeg && leg.arrivalTime && nextLeg.departureTime) {
    const end = new Date(leg.arrivalTime).getTime();
    const nextStart = new Date(nextLeg.departureTime).getTime();
    if (nextStart > end) {
      transferDuration = Math.round((nextStart - end) / 60000);
    }
  }

  return (
    <div className="relative">
      {/* Leg Container */}
      <div className="flex items-start gap-4 rounded-xl border border-white/5 bg-surface-secondary/70 p-4 transition-all">
        {/* Mode Icon Badge */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-brand-primary border border-white/10">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        {/* Leg Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-primary">
              {leg.mode || 'Transit'} · {serviceName}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{durationText}</span>
              {leg.distance ? <span>({leg.distance} km)</span> : null}
            </div>
          </div>

          {/* Time & Stops */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <div className="font-semibold text-text-primary flex items-center gap-2">
                <span>{depTime}</span>
                <span className="text-xs text-text-tertiary font-normal">Depart</span>
              </div>
              <div className="text-xs text-text-secondary truncate" title={originName}>
                {originName}
              </div>
            </div>

            <div>
              <div className="font-semibold text-text-primary flex items-center gap-2">
                <span>{arrTime}</span>
                <span className="text-xs text-text-tertiary font-normal">Arrive</span>
              </div>
              <div className="text-xs text-text-secondary truncate" title={destinationName}>
                {destinationName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer indicator between legs */}
      {!isLast && transferDuration > 0 && (
        <div className="my-2.5 flex items-center gap-2 px-6 text-xs text-semantic-warning font-medium">
          <div className="h-4 w-px bg-white/20 ml-2" />
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
          <span>Transfer connection ({formatDuration(transferDuration)})</span>
        </div>
      )}
    </div>
  );
}

export default JourneyLeg;
