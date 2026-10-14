import React from 'react';
import { Train, Bus, Plane, Car, Footprints, Clock } from 'lucide-react';
import {
  formatTime,
  formatDuration,
  getDayOffset,
  formatDayOffsetBadge,
} from '../../utils/formatters.js';

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

  const depTime = leg.departureTimeFormatted || formatTime(leg.departureTime);
  const arrTime = leg.arrivalTimeFormatted || formatTime(leg.arrivalTime);
  const durationText = formatDuration(leg.duration);

  const dayOffset = leg.dayOffset !== undefined ? leg.dayOffset : getDayOffset(leg.departureTime, leg.arrivalTime);
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
            ? 'border border-[#E8B04A] bg-[#181C22] p-3 sm:p-4 shadow-sm'
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
                className="h-2.5 w-2.5 rounded-full bg-[#E8B04A] ring-4 ring-[#E8B04A]/20 shrink-0"
                aria-hidden="true"
              />
              <div className="w-0.5 flex-1 bg-[#303640] min-h-[10px]" aria-hidden="true" />
            </div>

            {/* Departure Text */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-mono text-sm sm:text-base font-bold text-[#F0F1F3]">
                  {depTime}
                </span>
                <span
                  className="text-sm sm:text-base font-semibold text-[#F0F1F3] break-words leading-snug"
                  title={originName}
                >
                  {originName}
                </span>
              </div>
              {originCity && (
                <div className="text-xs text-[#7E8794] mt-0.5">{originCity}</div>
              )}
            </div>
          </div>

          {/* 2. Middle Row: Continuous Line alongside Transit Service Card */}
          <div className="flex items-stretch gap-3">
            {/* Timeline Spine Col - Continuous Vertical Line */}
            <div className="flex w-5 flex-col items-center shrink-0">
              <div className="w-0.5 h-full bg-[#303640]" aria-hidden="true" />
            </div>

            {/* Transit Service Metadata Card */}
            <div className="flex-1 min-w-0 py-2">
              <div className="rounded-xl border border-[#303640] bg-[#181C22] p-3 sm:p-3.5 transition-colors hover:border-[#424A56]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-[#E8B04A] shrink-0" aria-hidden="true" />
                    <span
                      className="text-sm font-semibold text-[#F0F1F3] break-words leading-snug"
                      title={serviceName}
                    >
                      {serviceName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-[#A7AFBA] shrink-0">
                    <Clock className="h-3.5 w-3.5 text-[#7E8794]" aria-hidden="true" />
                    <span>{durationText}</span>
                    {leg.distance ? <span>· {leg.distance} km</span> : null}
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#7E8794]">
                  <span className="capitalize text-[#A7AFBA] font-medium">
                    {leg.mode || 'Transit'}
                  </span>
                  {serviceClass && <span>{serviceClass}</span>}
                  {serviceNumber && (
                    <span className="font-mono text-[#A7AFBA]">#{serviceNumber}</span>
                  )}
                  {leg.quota && (
                    <span className="text-[#7E8794]">· Quota: {leg.quota}</span>
                  )}
                  {leg.fare?.amount !== undefined && leg.fare?.amount !== null && leg.fare?.amount > 0 ? (
                    <span className="font-semibold text-[#E8B04A]">
                      · ₹{leg.fare.amount}{leg.fare.isEstimated ? ' (est)' : ''}
                    </span>
                  ) : leg.price != null && leg.price > 0 ? (
                    <span className="font-semibold text-[#E8B04A]">
                      · ₹{leg.price}{leg.isEstimated ? ' (est)' : ''}
                    </span>
                  ) : null}
                </div>

                {/* Real-Time Leg Availability & Live Status */}
                {leg.availability && (() => {
                  // Use normalizedStatus from backend (backend normalizes via availabilityNorm.js)
                  const availStatus = leg.availability.normalizedStatus || leg.availability.status || 'UNKNOWN';
                  const rawStatus = leg.availability.rawStatus || leg.availability.originalStatus || '';
                  const seats = leg.availability.seatsAvailable;
                  const statusTooltip = rawStatus && rawStatus !== availStatus ? `Raw: ${rawStatus}` : '';

                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-[#303640] text-[11px]">
                      {availStatus === 'AVAILABLE' && (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title={statusTooltip}>
                          AVAILABLE {seats != null ? `(${seats})` : ''}
                        </span>
                      )}
                      {availStatus === 'RAC' && (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20" title={statusTooltip}>
                          RAC {seats != null && seats > 0 ? `(${seats})` : ''}
                        </span>
                      )}
                      {availStatus === 'WAITLIST' && (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20" title={statusTooltip}>
                          WAITLIST {rawStatus ? `· ${rawStatus}` : ''}
                        </span>
                      )}
                      {availStatus === 'UNAVAILABLE' && (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20" title={statusTooltip}>
                          NOT AVAILABLE
                        </span>
                      )}
                      {availStatus === 'UNKNOWN' && (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium bg-[#15191F] text-[#7E8794] border border-[#303640]">
                          {leg.availability.status === 'error' ? 'Could not fetch' : 'Availability unknown'}
                        </span>
                      )}

                      {leg.availability.queryTimestamp && (
                        <span className="text-[#7E8794] text-[10px]">
                          Checked {new Date(leg.availability.queryTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  );
                })()}

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
              <div className="w-0.5 h-1.5 bg-[#303640]" aria-hidden="true" />
              <div
                className="h-2.5 w-2.5 rounded-full border-2 border-[#E8B04A] bg-[#0B0D10] ring-2 ring-[#E8B04A]/20 shrink-0"
                aria-hidden="true"
              />
            </div>

            {/* Arrival Text */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-mono text-sm sm:text-base font-bold text-[#F0F1F3]">
                  {arrTime}
                </span>
                {dayBadge && (
                  <span className="rounded-md bg-[#15191F] px-1.5 py-0.5 text-[10px] font-bold text-[#E8B04A] border border-[#303640]">
                    {dayBadge}
                  </span>
                )}
                <span
                  className="text-sm sm:text-base font-semibold text-[#F0F1F3] break-words leading-snug"
                  title={destinationName}
                >
                  {destinationName}
                </span>
              </div>
              {destinationCity && (
                <div className="text-xs text-[#7E8794] mt-0.5">{destinationCity}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Connection Callout between segments */}
      {!isLast && transferDuration > 0 && (
        <div className="my-3 pl-8">
          <div className="flex items-center gap-2 rounded-lg border border-[#303640] bg-[#15191F] px-3 py-2 text-xs text-[#A7AFBA]">
            <Clock className="h-3.5 w-3.5 shrink-0 text-[#7E8794]" aria-hidden="true" />
            <span>
              <strong className="text-[#F0F1F3]">{formatDuration(transferDuration)}</strong> transfer connection at {destinationName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default JourneyLeg;
