import React from 'react';
import { Train, Bus, Plane, Car, Footprints, Clock } from 'lucide-react';
import { getDayOffset, formatDayOffsetBadge } from '../../utils/formatters.js';

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
 * Renders an individual journey segment in a clear vertical timeline (Section 12).
 * Shows departure stop, vehicle/operator details, arrival stop, day offsets,
 * and transfer connection duration without fabricating any stops.
 */
export function JourneyLeg({ leg, isLast = false, nextLeg = null, isSelected = false, onSelect = null }) {
  const Icon = getModeIcon(leg.mode);

  const originName = leg.origin?.name || leg.origin?.city || 'Origin';
  const destinationName = leg.destination?.name || leg.destination?.city || 'Destination';
  const originCity = leg.origin?.city && leg.origin?.name !== leg.origin?.city ? leg.origin.city : null;
  const destinationCity = leg.destination?.city && leg.destination?.name !== leg.destination?.city ? leg.destination.city : null;

  const depTime = formatTime(leg.departureTime);
  const arrTime = formatTime(leg.arrivalTime);
  const durationText = formatDuration(leg.duration);

  const dayOffset = getDayOffset(leg.departureTime, leg.arrivalTime);
  const dayBadge = formatDayOffsetBadge(dayOffset);

  const serviceName =
    leg.service?.name ||
    leg.service?.operator ||
    leg.vehicle?.type ||
    (leg.mode ? `${leg.mode.toUpperCase()} Transit` : 'Transit');

  const serviceClass = leg.service?.class ? `· ${leg.service.class}` : '';
  const serviceNumber = leg.service?.number || leg.vehicle?.identifier;

  // Calculate transfer duration between this leg and next leg
  let transferDuration = 0;
  if (nextLeg && leg.arrivalTime && nextLeg.departureTime) {
    const end = new Date(leg.arrivalTime).getTime();
    const nextStart = new Date(nextLeg.departureTime).getTime();
    if (nextStart > end) {
      transferDuration = Math.round((nextStart - end) / 60000);
    }
  }

  const handleClick = () => {
    if (onSelect) {
      onSelect(leg.sequence);
    }
  };

  return (
    <div className="relative">
      {/* Segment Container */}
      <div
        onClick={handleClick}
        className={`rounded-xl transition-all ${
          onSelect ? 'cursor-pointer' : ''
        } ${
          isSelected
            ? 'border border-brand-primary/60 bg-surface-elevated/80 p-3 sm:p-4 ring-1 ring-brand-primary/40'
            : ''
        }`}
      >
        {/* Continuous 3-Row Vertical Timeline Track */}
        <div className="space-y-0">
          {/* 1. Departure Point Row */}
          <div className="flex items-start gap-3">
            {/* Timeline Spine Col - Origin Marker */}
            <div className="flex w-5 flex-col items-center pt-1 shrink-0">
              <div
                className="h-2.5 w-2.5 rounded-full bg-brand-primary ring-4 ring-brand-primary/20 shrink-0"
                aria-hidden="true"
              />
              <div className="w-0.5 flex-1 bg-brand-primary/30 min-h-[10px]" aria-hidden="true" />
            </div>

            {/* Departure Text */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-mono text-sm sm:text-base font-bold text-text-primary">
                  {depTime}
                </span>
                <span
                  className="text-sm sm:text-base font-semibold text-text-primary break-words leading-snug"
                  title={originName}
                >
                  {originName}
                </span>
              </div>
              {originCity && (
                <div className="text-xs text-text-tertiary mt-0.5">{originCity}</div>
              )}
            </div>
          </div>

          {/* 2. Middle Row: Continuous Line alongside Transit Service Card */}
          <div className="flex items-stretch gap-3">
            {/* Timeline Spine Col - Continuous Vertical Line */}
            <div className="flex w-5 flex-col items-center shrink-0">
              <div className="w-0.5 h-full bg-brand-primary/30" aria-hidden="true" />
            </div>

            {/* Transit Service Metadata Card */}
            <div className="flex-1 min-w-0 py-2">
              <div className="rounded-xl border border-white/10 bg-surface-elevated/70 p-3 sm:p-3.5 transition-colors hover:border-white/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-brand-primary shrink-0" aria-hidden="true" />
                    <span
                      className="text-sm font-semibold text-text-primary break-words leading-snug"
                      title={serviceName}
                    >
                      {serviceName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-text-secondary shrink-0">
                    <Clock className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                    <span>{durationText}</span>
                    {leg.distance ? <span>· {leg.distance} km</span> : null}
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                  <span className="capitalize text-text-secondary font-medium">
                    {leg.mode || 'Transit'}
                  </span>
                  {serviceClass && <span>{serviceClass}</span>}
                  {serviceNumber && (
                    <span className="font-mono text-text-secondary">#{serviceNumber}</span>
                  )}
                  {leg.quota && (
                    <span className="text-text-tertiary">· Quota: {leg.quota}</span>
                  )}
                  {leg.fare?.amount !== undefined && (
                    <span className="font-semibold text-emerald-400">
                      · ₹{leg.fare.amount}{leg.fare.isEstimated ? ' (est)' : ''}
                    </span>
                  )}
                </div>

                {/* Real-Time Leg Availability & Live Status */}
                {leg.availability && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 text-[11px]">
                    {leg.availability.status === 'AVAILABLE' && (
                      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        AVAILABLE {leg.availability.seatsAvailable ? `(${leg.availability.seatsAvailable})` : ''}
                      </span>
                    )}
                    {leg.availability.status === 'RAC' && (
                      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        RAC {leg.availability.seatsAvailable ? `(${leg.availability.seatsAvailable})` : ''}
                      </span>
                    )}
                    {leg.availability.status === 'WAITLISTED' && (
                      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        WAITLISTED
                      </span>
                    )}
                    {leg.availability.status === 'NOT_AVAILABLE' && (
                      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        NOT AVAILABLE
                      </span>
                    )}
                    {leg.availability.status === 'UNKNOWN' && (
                      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium bg-white/5 text-text-tertiary border border-white/10">
                        AVAILABILITY UNKNOWN
                      </span>
                    )}

                    {leg.availability.queryTimestamp && (
                      <span className="text-text-tertiary text-[10px]">
                        Checked {new Date(leg.availability.queryTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}

                {/* Live Running Delay Warning */}
                {leg.liveStatus?.delayMinutes > 5 && (
                  <div className="mt-1.5 text-[11px] text-amber-400 font-medium">
                    ⚠️ Running ~{leg.liveStatus.delayMinutes} mins late
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Arrival Point Row */}
          <div className="flex items-start gap-3">
            {/* Timeline Spine Col - Destination Marker */}
            <div className="flex w-5 flex-col items-center shrink-0">
              <div className="w-0.5 h-1.5 bg-brand-primary/30" aria-hidden="true" />
              <div
                className="h-2.5 w-2.5 rounded-full border-2 border-brand-primary bg-background-primary ring-2 ring-brand-primary/10 shrink-0"
                aria-hidden="true"
              />
            </div>

            {/* Arrival Text */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-mono text-sm sm:text-base font-bold text-text-primary">
                  {arrTime}
                </span>
                {dayBadge && (
                  <span className="rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-primary border border-brand-primary/20">
                    {dayBadge}
                  </span>
                )}
                <span
                  className="text-sm sm:text-base font-semibold text-text-primary break-words leading-snug"
                  title={destinationName}
                >
                  {destinationName}
                </span>
              </div>
              {destinationCity && (
                <div className="text-xs text-text-tertiary mt-0.5">{destinationCity}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Connection Callout between segments */}
      {!isLast && transferDuration > 0 && (
        <div className="my-3 pl-8">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              <strong>{formatDuration(transferDuration)}</strong> transfer connection at {destinationName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default JourneyLeg;
