import React from 'react';
import {
  Train,
  Clock,
  ArrowRight,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Ticket,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatTransfers,
  getDayOffset,
  formatDayOffsetBadge,
} from '../../utils/formatters.js';
import { getModeIcon } from './JourneyLeg.jsx';

import {
  KNOWN_STATIONS,
  resolveStation,
  parseJourneyStages,
} from '../../utils/journeyParser.js';

export { KNOWN_STATIONS, resolveStation, parseJourneyStages };

/**
 * CompleteJourneyTimeline Component
 *
 * Implements Graphite & Amber visual theme:
 * - Header banner with requested endpoints and station shift notice
 * - Continuous vertical timeline (Access -> Actual Train -> Onward)
 * - Prominent Stage 2 Actual Train Journey card
 * - Honest unarranged warnings (Stage 1 & Stage 3)
 * - Cost breakdown distinguishing estimates, actual fares, and partial totals
 * - Total Journey Summary
 */
export function CompleteJourneyTimeline({
  journey,
  onViewMap = null,
  onOpenBooking = null,
  className = '',
}) {
  const parsed = parseJourneyStages(journey);
  if (!parsed) return null;

  const {
    reqOriginCode,
    reqOriginName,
    reqDestCode,
    reqDestName,
    trainFromCode,
    trainFromName,
    trainToCode,
    trainToName,
    hasStationDifference,
    accessStage,
    trainStage,
    trainStages,
    onwardStage,
    stagesList,
    accessToTrainBuffer,
    trainToOnwardBuffer,
    costs,
  } = parsed;

  const totalDurationText = formatDuration(journey.duration);
  const effectiveTrainStages = Array.isArray(trainStages) && trainStages.length > 0
    ? trainStages
    : (trainStage ? [trainStage] : []);
  const totalTransfers = journey.numberOfTransfers ?? (effectiveTrainStages.length > 1 ? effectiveTrainStages.length - 1 : 0);

  return (
    <div className={`space-y-6 text-[#EDEFF2] ${className}`} aria-label="Complete Journey Itinerary">
      {/* 1. Header Banner */}
      <div className="rounded-xl border border-[#232830] bg-[#12151A] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#E8B04A] px-2.5 py-0.5 text-[10px] font-bold text-[#0B0D10] uppercase tracking-wider">
                COMPLETE JOURNEY
              </span>
              <span className="text-xs font-semibold text-[#9AA3AF]">
                {stagesList.length} {stagesList.length === 1 ? 'Stage' : 'Stages'} · {totalTransfers === 0 ? 'Direct train' : formatTransfers(totalTransfers)}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-[#EDEFF2] flex flex-wrap items-center gap-2">
              <span>{reqOriginName}</span>
              {reqOriginCode && <span className="text-[#6B7480] font-mono text-xs">({reqOriginCode})</span>}
              <ArrowRight className="h-4 w-4 text-[#E8B04A]" aria-hidden="true" />
              <span>{reqDestName}</span>
              {reqDestCode && <span className="text-[#6B7480] font-mono text-xs">({reqDestCode})</span>}
            </h3>
          </div>

          {onViewMap && (
            <button
              type="button"
              onClick={onViewMap}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] hover:bg-[#232830] px-3.5 py-2 text-xs font-semibold text-[#E8B04A] hover:text-[#F0C066] transition-colors cursor-pointer"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>View Route Map</span>
            </button>
          )}
        </div>

        {hasStationDifference && (
          <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-[#E07B39]/30 bg-[#E07B39]/10 p-3 text-xs text-[#EDEFF2]">
            <AlertCircle className="h-4 w-4 text-[#E07B39] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="leading-relaxed">
              <span className="font-semibold text-[#E07B39]">Station shift notice: </span>
              <span className="text-[#9AA3AF]">
                Your selected train uses different stations from your requested locations. The itinerary below shows how your origin ({reqOriginCode || reqOriginName}), actual boarding station ({trainFromCode || trainFromName}), actual arrival station ({trainToCode || trainToName}), and destination ({reqDestCode || reqDestName}) connect.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Continuous Vertical Visual Timeline */}
      <div className="rounded-xl border border-[#232830] bg-[#12151A] p-4 sm:p-6 space-y-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#9AA3AF] flex items-center gap-2">
          <span>JOURNEY TIMELINE</span>
          <span className="h-px flex-1 bg-[#232830]" />
        </h4>

        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#232830]">
          {/* ================= STAGE 1: ACCESS JOURNEY ================= */}
          {accessStage && (
            <div className="relative">
              {/* Timeline marker */}
              <div
                className="absolute -left-6 sm:-left-8 top-1 h-3 w-3 rounded-full bg-[#E8B04A] ring-4 ring-[#12151A]"
                aria-hidden="true"
              />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#E8B04A]">
                      {accessStage.title}
                    </span>
                    <span className="text-xs text-[#6B7480]">·</span>
                    <span className="text-xs font-semibold text-[#9AA3AF]">
                      {accessStage.originCode || accessStage.originName} → {accessStage.destinationCode || accessStage.destinationName}
                    </span>
                  </div>
                  {accessStage.type === 'connected' ? (
                    <span className="rounded-md bg-[#181C22] px-2 py-0.5 text-[10px] font-semibold text-[#4CC38A] border border-[#232830]">
                      Connected
                    </span>
                  ) : (
                    <span className="rounded-md bg-[#E07B39]/10 px-2 py-0.5 text-[10px] font-semibold text-[#E07B39] border border-[#E07B39]/30">
                      Unarranged
                    </span>
                  )}
                </div>

                {accessStage.type === 'connected' ? (
                  <div className="rounded-xl border border-[#232830] bg-[#181C22] p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232830] pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {React.createElement(getModeIcon(accessStage.mode), {
                          className: 'h-4 w-4 text-[#E8B04A] shrink-0',
                        })}
                        <span className="font-semibold text-sm text-[#EDEFF2]">
                          {accessStage.serviceName}
                          {accessStage.trainNumber ? ` #${accessStage.trainNumber}` : ''}
                        </span>
                        <span className="text-xs text-[#9AA3AF] capitalize">· {accessStage.mode}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#9AA3AF] font-mono">
                        {accessStage.duration ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-[#6B7480]" />
                            <span>{formatDuration(accessStage.duration)}</span>
                          </span>
                        ) : null}
                        {accessStage.distance ? <span>{accessStage.distance} km</span> : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#6B7480]">Requested Origin</div>
                        <div className="mt-0.5 font-bold text-sm text-[#EDEFF2]">
                          {accessStage.originName} {accessStage.originCode && `(${accessStage.originCode})`}
                        </div>
                        {accessStage.originCity && <div className="text-[#9AA3AF]">{accessStage.originCity}</div>}
                        <div className="mt-1 font-mono text-[#EDEFF2]">{accessStage.departureTime}</div>
                        {accessStage.departureDate && <div className="text-[11px] text-[#6B7480]">{accessStage.departureDate}</div>}
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#6B7480]">Boarding Station (Arrival)</div>
                        <div className="mt-0.5 font-bold text-sm text-[#EDEFF2]">
                          {accessStage.destinationName} {accessStage.destinationCode && `(${accessStage.destinationCode})`}
                        </div>
                        {accessStage.destinationCity && <div className="text-[#9AA3AF]">{accessStage.destinationCity}</div>}
                        <div className="mt-1 font-mono text-[#EDEFF2] flex items-baseline gap-1.5">
                          <span>{accessStage.arrivalTime}</span>
                          {accessStage.dayOffset > 0 && (
                            <span className="text-[10px] font-bold text-[#E8B04A]">{formatDayOffsetBadge(accessStage.dayOffset)}</span>
                          )}
                        </div>
                        {accessStage.arrivalDate && <div className="text-[11px] text-[#6B7480]">{accessStage.arrivalDate}</div>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#232830] text-xs text-[#9AA3AF]">
                      <div>
                        Provider: <strong className="text-[#EDEFF2]">{accessStage.provider}</strong>
                      </div>
                      <div>
                        Cost:{' '}
                        {accessStage.fare ? (
                          <span className="font-mono font-bold text-[#EDEFF2]">₹{accessStage.fare} {accessStage.isEstimatedFare ? '(est)' : ''}</span>
                        ) : (
                          <span className="text-[#6B7480] italic">{accessStage.fareNote || 'Local transport fare not included'}</span>
                        )}
                      </div>
                    </div>

                    {accessStage.connectionStatus && (
                      <div className="text-[11px] text-[#E8B04A] flex items-center gap-1.5 pt-1">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#4CC38A]" />
                        <span>{accessStage.connectionStatus}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Unarranged Access Warning Card */
                  <div className="rounded-xl border border-[#E07B39]/40 bg-[#E07B39]/10 p-4 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-[#E07B39]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{accessStage.connectionStatus}</span>
                    </div>
                    <p className="text-[#EDEFF2] leading-relaxed">
                      {accessStage.noticeText}
                    </p>
                    <p className="text-[11px] text-[#9AA3AF] italic">
                      Do not invent transport details. Allow sufficient travel buffer from {accessStage.originName} to reach {accessStage.destinationName} before the scheduled departure.
                    </p>
                  </div>
                )}

                {/* Transfer / buffer gap to main train */}
                {accessToTrainBuffer !== null && (
                  <div className="my-2 flex items-center gap-2 text-xs text-[#9AA3AF] bg-[#181C22] rounded-lg px-3 py-1.5 border border-[#232830]">
                    <Clock className="h-3.5 w-3.5 text-[#E8B04A]" />
                    <span>
                      Boarding transfer buffer: <strong className="text-[#EDEFF2] font-mono">{formatDuration(accessToTrainBuffer)}</strong> before train departure at {trainFromName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= ACTUAL TRAIN JOURNEY STAGE(S) ================= */}
          {effectiveTrainStages.map((currTrainStage, idx) => (
            <div key={currTrainStage.trainNumber ? `${currTrainStage.trainNumber}-${idx}` : idx} className="relative">
              {/* Prominent Train timeline marker */}
              <div
                className="absolute -left-6 sm:-left-8 top-1 h-3.5 w-3.5 rounded-full bg-[#E8B04A] ring-4 ring-[#E8B04A]/30"
                aria-hidden="true"
              />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#E8B04A] px-2 py-0.5 text-[10px] font-bold text-[#0B0D10] uppercase tracking-wider">
                      {currTrainStage.title}
                    </span>
                    <span className="text-xs font-semibold text-[#EDEFF2]">
                      {currTrainStage.originCode || currTrainStage.originName} → {currTrainStage.destinationCode || currTrainStage.destinationName}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#9AA3AF]">
                    Class {currTrainStage.travelClass}
                  </span>
                </div>

                {/* Visually Prominent Train Segment Card */}
                <div className="rounded-2xl border-2 border-[#E8B04A]/40 bg-[#181C22] p-4 sm:p-5 shadow-lg shadow-[#E8B04A]/5 ring-1 ring-[#E8B04A]/20 space-y-4">
                  {/* Train Identity Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232830] pb-3.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8B04A]/10 border border-[#E8B04A]/30 shrink-0">
                        <Train className="h-5 w-5 text-[#E8B04A]" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm sm:text-base font-extrabold text-[#EDEFF2] truncate">
                          {currTrainStage.trainName}
                        </div>
                        <div className="text-xs text-[#9AA3AF] font-mono">
                          Train #{currTrainStage.trainNumber} · {currTrainStage.provider}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {currTrainStage.availability?.status === 'AVAILABILITY_VERIFIED' ||
                      currTrainStage.availability?.status === 'AVAILABLE' ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#4CC38A]/10 px-2.5 py-1 text-xs font-bold text-[#4CC38A] border border-[#4CC38A]/20">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>AVAILABLE {currTrainStage.availability.seats != null ? `(${currTrainStage.availability.seats})` : ''}</span>
                        </span>
                      ) : currTrainStage.availability?.status === 'RAC' ||
                        currTrainStage.availability?.status === 'RAC_AVAILABLE' ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#E8B04A]/10 px-2.5 py-1 text-xs font-bold text-[#E8B04A] border border-[#E8B04A]/20">
                          <span>RAC {currTrainStage.availability.seats ? `(${currTrainStage.availability.seats})` : ''}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#12151A] px-2.5 py-1 text-xs font-semibold text-[#9AA3AF] border border-[#232830]">
                          <span>{currTrainStage.availability?.rawStatus || currTrainStage.availability?.status || 'Seat Status on IRCTC'}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stations & Schedule Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                    {/* Departure Station */}
                    <div className="sm:col-span-5 min-w-0">
                      <div className="text-2xl sm:text-3xl font-extrabold text-[#EDEFF2] font-mono tabular-nums">
                        {currTrainStage.departureTime}
                      </div>
                      <div className="mt-1 font-bold text-sm text-[#EDEFF2] leading-snug">
                        {currTrainStage.originName} {currTrainStage.originCode && <span className="text-[#E8B04A] font-mono">({currTrainStage.originCode})</span>}
                      </div>
                      {currTrainStage.originCity && (
                        <div className="text-xs text-[#9AA3AF]">{currTrainStage.originCity}</div>
                      )}
                      {currTrainStage.departureDate && (
                        <div className="text-xs text-[#6B7480] mt-0.5">{currTrainStage.departureDate}</div>
                      )}
                      <div className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wider text-[#E8B04A]">
                        {idx === 0 ? 'Actual Boarding Station' : 'Transfer Boarding Station'}
                      </div>
                    </div>

                    {/* Route Line & Duration */}
                    <div className="sm:col-span-2 flex flex-col items-center justify-center py-2 sm:py-0">
                      <div className="text-xs font-bold font-mono text-[#EDEFF2] flex items-center gap-1">
                        <Clock className="h-3 w-3 text-[#E8B04A]" />
                        <span>{formatDuration(currTrainStage.duration)}</span>
                      </div>
                      <div className="relative my-2 w-full max-w-[100px] flex items-center justify-center">
                        <div className="h-px w-full bg-[#232830]" />
                        <ArrowRight className="absolute right-0 h-3.5 w-3.5 text-[#E8B04A]" />
                      </div>
                      {currTrainStage.distance && (
                        <div className="text-[11px] font-mono text-[#6B7480]">
                          {currTrainStage.distance} km
                        </div>
                      )}
                    </div>

                    {/* Arrival Station */}
                    <div className="sm:col-span-5 min-w-0 sm:text-right">
                      <div className="text-2xl sm:text-3xl font-extrabold text-[#EDEFF2] font-mono tabular-nums flex items-baseline sm:justify-end gap-1.5">
                        <span>{currTrainStage.arrivalTime}</span>
                        {currTrainStage.dayOffset > 0 && (
                          <span className="rounded-md bg-[#E8B04A]/10 px-1.5 py-0.5 text-xs font-bold text-[#E8B04A] border border-[#E8B04A]/30">
                            {formatDayOffsetBadge(currTrainStage.dayOffset)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-bold text-sm text-[#EDEFF2] leading-snug">
                        {currTrainStage.destinationName} {currTrainStage.destinationCode && <span className="text-[#E8B04A] font-mono">({currTrainStage.destinationCode})</span>}
                      </div>
                      {currTrainStage.destinationCity && (
                        <div className="text-xs text-[#9AA3AF]">{currTrainStage.destinationCity}</div>
                      )}
                      {currTrainStage.arrivalDate && (
                        <div className="text-xs text-[#6B7480] mt-0.5">{currTrainStage.arrivalDate}</div>
                      )}
                      <div className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wider text-[#E8B04A]">
                        {idx === effectiveTrainStages.length - 1 ? 'Actual Arrival Station' : 'Transfer Station'}
                      </div>
                    </div>
                  </div>

                  {/* Fare & Guidelines Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#232830] text-xs">
                    <div>
                      <span className="text-[#9AA3AF]">Train Fare: </span>
                      <strong className="text-sm font-mono text-[#EDEFF2]">
                        {currTrainStage.fare ? `₹${currTrainStage.fare}` : 'Unavailable'}
                      </strong>
                      {currTrainStage.isEstimatedFare && (
                        <span className="text-[10px] text-[#6B7480] ml-1">(est based on distance)</span>
                      )}
                    </div>

                    {onOpenBooking && (
                      <button
                        type="button"
                        onClick={onOpenBooking}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8B04A] hover:bg-[#F0C066] px-3 py-1.5 text-xs font-bold text-[#0B0D10] shadow-sm transition-colors cursor-pointer"
                      >
                        <Ticket className="h-3.5 w-3.5" />
                        <span>Booking Guidelines</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Transfer / buffer gap between consecutive trains */}
                {currTrainStage.transferBuffer && (
                  <div className="my-2.5 flex items-center gap-2.5 text-xs text-[#9AA3AF] bg-[#181C22] rounded-xl p-3 border border-[#E8B04A]/30">
                    <ArrowRightLeft className="h-4 w-4 text-[#E8B04A] shrink-0" />
                    <div>
                      <span className="font-bold text-[#EDEFF2]">
                        Change Trains at {currTrainStage.transferBuffer.transferStationName} {currTrainStage.transferBuffer.transferStationCode && `(${currTrainStage.transferBuffer.transferStationCode})`}:
                      </span>{' '}
                      Connection buffer{' '}
                      <strong className="text-[#E8B04A] font-mono">
                        {currTrainStage.transferBuffer.bufferMinutes != null ? formatDuration(currTrainStage.transferBuffer.bufferMinutes) : 'Layover'}
                      </strong>{' '}
                      before Train #{currTrainStage.transferBuffer.nextTrainNumber} ({currTrainStage.transferBuffer.nextTrainName})
                    </div>
                  </div>
                )}

                {/* Transfer / buffer gap to onward journey (only on final train stage) */}
                {idx === effectiveTrainStages.length - 1 && trainToOnwardBuffer !== null && (
                  <div className="my-2 flex items-center gap-2 text-xs text-[#9AA3AF] bg-[#181C22] rounded-lg px-3 py-1.5 border border-[#232830]">
                    <Clock className="h-3.5 w-3.5 text-[#E8B04A]" />
                    <span>
                      Connection transfer buffer: <strong className="text-[#EDEFF2] font-mono">{formatDuration(trainToOnwardBuffer)}</strong> at {trainToName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* ================= STAGE 3: ONWARD JOURNEY ================= */}
          {onwardStage && (
            <div className="relative">
              {/* Timeline marker */}
              <div
                className="absolute -left-6 sm:-left-8 top-1 h-3 w-3 rounded-full border-2 border-[#E8B04A] bg-[#0B0D10] ring-4 ring-[#12151A]"
                aria-hidden="true"
              />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#E8B04A]">
                      {onwardStage.title}
                    </span>
                    <span className="text-xs text-[#6B7480]">·</span>
                    <span className="text-xs font-semibold text-[#9AA3AF]">
                      {onwardStage.originCode || onwardStage.originName} → {onwardStage.destinationCode || onwardStage.destinationName}
                    </span>
                  </div>
                  {onwardStage.type === 'connected' ? (
                    <span className="rounded-md bg-[#181C22] px-2 py-0.5 text-[10px] font-semibold text-[#4CC38A] border border-[#232830]">
                      Connected
                    </span>
                  ) : (
                    <span className="rounded-md bg-[#E07B39]/10 px-2 py-0.5 text-[10px] font-semibold text-[#E07B39] border border-[#E07B39]/30">
                      Unarranged
                    </span>
                  )}
                </div>

                {onwardStage.type === 'connected' ? (
                  <div className="rounded-xl border border-[#232830] bg-[#181C22] p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232830] pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {React.createElement(getModeIcon(onwardStage.mode), {
                          className: 'h-4 w-4 text-[#E8B04A] shrink-0',
                        })}
                        <span className="font-semibold text-sm text-[#EDEFF2]">
                          {onwardStage.serviceName}
                          {onwardStage.trainNumber ? ` #${onwardStage.trainNumber}` : ''}
                        </span>
                        <span className="text-xs text-[#9AA3AF] capitalize">· {onwardStage.mode}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#9AA3AF] font-mono">
                        {onwardStage.duration ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-[#6B7480]" />
                            <span>{formatDuration(onwardStage.duration)}</span>
                          </span>
                        ) : null}
                        {onwardStage.distance ? <span>{onwardStage.distance} km</span> : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#6B7480]">Train Arrival Station (Origin)</div>
                        <div className="mt-0.5 font-bold text-sm text-[#EDEFF2]">
                          {onwardStage.originName} {onwardStage.originCode && `(${onwardStage.originCode})`}
                        </div>
                        {onwardStage.originCity && <div className="text-[#9AA3AF]">{onwardStage.originCity}</div>}
                        <div className="mt-1 font-mono text-[#EDEFF2]">{onwardStage.departureTime}</div>
                        {onwardStage.departureDate && <div className="text-[11px] text-[#6B7480]">{onwardStage.departureDate}</div>}
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#6B7480]">Final Requested Destination</div>
                        <div className="mt-0.5 font-bold text-sm text-[#EDEFF2]">
                          {onwardStage.destinationName} {onwardStage.destinationCode && `(${onwardStage.destinationCode})`}
                        </div>
                        {onwardStage.destinationCity && <div className="text-[#9AA3AF]">{onwardStage.destinationCity}</div>}
                        <div className="mt-1 font-mono text-[#EDEFF2] flex items-baseline gap-1.5">
                          <span>{onwardStage.arrivalTime}</span>
                          {onwardStage.dayOffset > 0 && (
                            <span className="text-[10px] font-bold text-[#E8B04A]">{formatDayOffsetBadge(onwardStage.dayOffset)}</span>
                          )}
                        </div>
                        {onwardStage.arrivalDate && <div className="text-[11px] text-[#6B7480]">{onwardStage.arrivalDate}</div>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#232830] text-xs text-[#9AA3AF]">
                      <div>
                        Provider: <strong className="text-[#EDEFF2]">{onwardStage.provider}</strong>
                      </div>
                      <div>
                        Cost:{' '}
                        {onwardStage.fare ? (
                          <span className="font-mono font-bold text-[#EDEFF2]">₹{onwardStage.fare} {onwardStage.isEstimatedFare ? '(est)' : ''}</span>
                        ) : (
                          <span className="text-[#6B7480] italic">{onwardStage.fareNote || 'Local transport fare not included'}</span>
                        )}
                      </div>
                    </div>

                    {onwardStage.connectionStatus && (
                      <div className="text-[11px] text-[#E8B04A] flex items-center gap-1.5 pt-1">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#4CC38A]" />
                        <span>{onwardStage.connectionStatus}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Unarranged Onward Warning Card */
                  <div className="rounded-xl border border-[#E07B39]/40 bg-[#E07B39]/10 p-4 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-[#E07B39]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{onwardStage.connectionStatus}</span>
                    </div>
                    <p className="text-[#EDEFF2] leading-relaxed">
                      {onwardStage.noticeText}
                    </p>
                    <p className="text-[11px] text-[#9AA3AF] italic">
                      Check local transport options upon arrival at {onwardStage.originName} to complete your trip to {onwardStage.destinationName}.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Cost Breakdown (Section 6) */}
      <div className="rounded-xl border border-[#232830] bg-[#12151A] p-4 sm:p-5 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#9AA3AF]">
          COST BREAKDOWN
        </h4>

        <div className="divide-y divide-[#232830] text-xs">
          {accessStage && (
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[#9AA3AF]">
                ACCESS JOURNEY ({accessStage.originCode || accessStage.originName} → {accessStage.destinationCode || accessStage.destinationName})
              </span>
              <span className="font-mono font-semibold text-[#EDEFF2]">
                {costs.accessFare ? (
                  `₹${costs.accessFare}${costs.accessFareEstimated ? ' (est)' : ''}`
                ) : (
                  <span className="text-[#6B7480] font-normal italic">
                    {costs.accessFareNote || 'Not arranged / local fare not included'}
                  </span>
                )}
              </span>
            </div>
          )}

          {trainStage && (
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[#9AA3AF]">
                TRAIN FARE ({trainStage.originCode || trainStage.originName} → {trainStage.destinationCode || trainStage.destinationName})
              </span>
              <span className="font-mono font-bold text-[#EDEFF2]">
                {costs.trainFare ? (
                  `₹${costs.trainFare}${costs.trainFareEstimated ? ' (est)' : ''}`
                ) : (
                  <span className="text-[#6B7480] font-normal italic">Unavailable</span>
                )}
              </span>
            </div>
          )}

          {onwardStage && (
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[#9AA3AF]">
                ONWARD JOURNEY ({onwardStage.originCode || onwardStage.originName} → {onwardStage.destinationCode || onwardStage.destinationName})
              </span>
              <span className="font-mono font-semibold text-[#EDEFF2]">
                {costs.onwardFare ? (
                  `₹${costs.onwardFare}${costs.onwardFareEstimated ? ' (est)' : ''}`
                ) : (
                  <span className="text-[#6B7480] font-normal italic">
                    {costs.onwardFareNote || 'Not arranged / local fare not included'}
                  </span>
                )}
              </span>
            </div>
          )}

          <div className="flex items-baseline justify-between pt-3">
            <div>
              <div className="font-bold text-[#EDEFF2]">
                {costs.hasMissingCosts ? 'TOTAL ESTIMATED COST (PARTIAL)' : 'TOTAL ESTIMATED JOURNEY COST'}
              </div>
              {costs.hasMissingCosts && (
                <div className="text-[11px] text-[#E07B39] mt-0.5">
                  Complete journey cost unavailable (Access & onward transport fares not included)
                </div>
              )}
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-[#E8B04A] tabular-nums">
              {costs.knownCostSum > 0 ? `₹${costs.knownCostSum}` : 'Price unavailable'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Total Journey Summary (Section 4) */}
      <div className="rounded-xl border border-[#232830] bg-[#181C22] p-4 sm:p-5 space-y-3 text-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#E8B04A]">
          TOTAL JOURNEY SUMMARY
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-[#12151A] p-3 border border-[#232830]">
            <div className="text-[10px] uppercase font-bold text-[#6B7480]">Requested Journey</div>
            <div className="mt-1 font-bold text-sm text-[#EDEFF2]">
              {reqOriginName} {reqOriginCode && `(${reqOriginCode})`} → {reqDestName} {reqDestCode && `(${reqDestCode})`}
            </div>
          </div>

          <div className="rounded-lg bg-[#12151A] p-3 border border-[#232830]">
            <div className="text-[10px] uppercase font-bold text-[#6B7480]">Actual Train Segment</div>
            <div className="mt-1 font-bold text-sm text-[#EDEFF2]">
              {trainFromName} {trainFromCode && `(${trainFromCode})`} → {trainToName} {trainToCode && `(${trainToCode})`}
            </div>
          </div>

          <div className="rounded-lg bg-[#12151A] p-3 border border-[#232830]">
            <div className="text-[10px] uppercase font-bold text-[#6B7480]">Total Journey Duration</div>
            <div className="mt-1 font-mono font-bold text-sm text-[#EDEFF2]">
              {totalDurationText}
            </div>
          </div>

          <div className="rounded-lg bg-[#12151A] p-3 border border-[#232830]">
            <div className="text-[10px] uppercase font-bold text-[#6B7480]">Connection Status</div>
            <div className="mt-1 font-semibold text-xs text-[#EDEFF2]">
              {hasStationDifference
                ? (accessStage?.type === 'connected' && onwardStage?.type === 'connected'
                    ? 'Connected multi-stage journey'
                    : 'Train operates between nearby stations · Local transfers required')
                : 'Direct train journey'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-[#9AA3AF]">
          <span>
            Transfers: <strong className="text-[#EDEFF2]">{totalTransfers}</strong>
          </span>
          {onViewMap && (
            <button
              type="button"
              onClick={onViewMap}
              className="text-[#E8B04A] hover:underline cursor-pointer font-semibold"
            >
              [View Route Map]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompleteJourneyTimeline;
