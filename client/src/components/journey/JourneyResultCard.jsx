import React, { useState, useEffect } from 'react';
import {
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  Bookmark,
  CheckCircle2,
  GitCompare,
  Ticket,
  AlertCircle,
  X,
  Loader2,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import {
  formatDuration,
  formatPrice,
  formatTime,
  formatDateDisplay,
  formatTransfers,
  getDayOffset,
  formatDayOffsetBadge,
  getPriceLabel,
  getRecommendationExplanation,
} from '../../utils/formatters.js';
import { getModeIcon } from './JourneyLeg.jsx';
import { parseJourneyStages, CompleteJourneyTimeline, resolveStation } from './CompleteJourneyTimeline.jsx';

/**
 * JourneyResultCard Component
 *
 * Implements Graphite & Amber Complete Journey Design System:
 * - Collapsed Journey Card (Section 3):
 *   - Clear distinction between Requested Journey (Origin -> Destination)
 *     and Actual Train Route (Boarding Station -> Arrival Station).
 *   - Scannable 4-point metrics: Departure, Arrival, Duration, Cost.
 *   - Primary CTA: [View Complete Itinerary] in Accent Amber (#E8B04A).
 * - Expanded Complete Journey (Sections 4, 5, 6, 7):
 *   - End-to-end continuous vertical timeline (Access -> Train -> Onward).
 *   - Visually prominent train segment.
 *   - Honest handling of unarranged connections without fabricating fake transit.
 *   - Transparent Cost Breakdown & Timing Buffer analysis.
 */
export function JourneyResultCard({
  journey,
  isTopPick = false,
  allJourneys = [],
  onViewJourney,
  onBookJourney,
  isSaved: initialSaved,
  onRemoveSaved,
  onToggleCompare,
  isCompared = false,
}) {
  const { isAuthenticated } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [saved, setSaved] = useState(initialSaved || false);
  const [saving, setSaving] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  const handleBookNow = async () => {
    setBookingLoading(true);
    setBookingError(null);
    try {
      const journeyId = journey.id || journey._id;
      sessionStorage.setItem(
        'yatrai_pending_booking',
        JSON.stringify({
          journeyId,
          journeySnapshot: journey,
          savedAt: Date.now(),
        })
      );

      setBookingModalOpen(false);

      if (!isAuthenticated) {
        if (onBookJourney) {
          onBookJourney(journey, false);
        } else {
          window.history.pushState(null, '', '/profile');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } else {
        if (onBookJourney) {
          onBookJourney(journey, true);
        } else {
          window.history.pushState(null, '', `/booking?journeyId=${journeyId}`);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }
    } catch (err) {
      setBookingError(err.message || 'Unable to proceed to booking.');
    } finally {
      setBookingLoading(false);
    }
  };

  useEffect(() => {
    if (initialSaved !== undefined) {
      setSaved(initialSaved);
      return;
    }
    if (isAuthenticated && journey?.id) {
      api.savedJourneys
        .check(journey.id)
        .then((res) => {
          if (res?.data?.saved !== undefined) {
            setSaved(res.data.saved);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, journey?.id, initialSaved]);

  const handleToggleSave = async (e) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    if (!journey?.id || saving) return;

    setSaving(true);
    try {
      if (saved) {
        await api.savedJourneys.remove(journey.id);
        setSaved(false);
        if (onRemoveSaved) onRemoveSaved(journey.id);
      } else {
        await api.savedJourneys.save(journey.id);
        setSaved(true);
      }
    } catch {
      // Keep previous state
    } finally {
      setSaving(false);
    }
  };

  if (!journey) return null;

  // Parse structured end-to-end journey stages
  const parsed = parseJourneyStages(journey);

  const originName = parsed?.reqOriginName || journey.origin?.name || journey.origin?.city || 'Origin';
  const destinationName = parsed?.reqDestName || journey.destination?.name || journey.destination?.city || 'Destination';
  const originCode = parsed?.reqOriginCode || '';
  const destinationCode = parsed?.reqDestCode || '';

  const trainFromName = parsed?.trainFromName || originName;
  const trainFromCode = parsed?.trainFromCode || originCode;
  const trainToName = parsed?.trainToName || destinationName;
  const trainToCode = parsed?.trainToCode || destinationCode;
  const hasStationDifference = Boolean(parsed?.hasStationDifference);

  // Train and timetable details
  const trainStage = parsed?.trainStage;
  const depTime = trainStage?.departureTime || journey.departureTimeFormatted || formatTime(journey.departureTime);
  const arrTime = trainStage?.arrivalTime || journey.arrivalTimeFormatted || formatTime(journey.arrivalTime);
  const depDate = trainStage?.departureDate || (journey.departureDateFormatted ? formatDateDisplay(journey.departureDateFormatted) : formatDateDisplay(journey.departureTime));
  const arrDate = trainStage?.arrivalDate || (journey.arrivalDateFormatted ? formatDateDisplay(journey.arrivalDateFormatted) : formatDateDisplay(journey.arrivalTime));

  const rawDuration = journey.duration ?? journey.durationMinutes ?? trainStage?.duration ?? null;
  const durationText = formatDuration(rawDuration);

  const dayOffset = trainStage?.dayOffset ?? (journey.dayOffset !== undefined ? journey.dayOffset : getDayOffset(journey.departureTime, journey.arrivalTime, rawDuration));
  const dayOffsetBadge = formatDayOffsetBadge(dayOffset);

  const rawPrice =
    journey.totalPrice ??
    journey.pricing?.totalFare ??
    journey.pricing?.mainTrainFare ??
    journey.fare ??
    journey.price ??
    parsed?.costs?.knownCostSum ??
    null;
  const isEstimated = Boolean(journey.pricing?.isEstimated || journey.metadata?.isEstimatedPrice || journey.isEstimated);
  const fareSource = journey.pricing?.fareSource || journey.metadata?.fareSource || (isEstimated ? 'estimate' : null);
  const priceText = formatPrice(rawPrice, journey.currency, { isEstimated, fareSource });
  const priceLabel = parsed?.costs?.hasMissingCosts
    ? 'Total Estimated Cost (Partial)'
    : getPriceLabel(journey);

  const legs = Array.isArray(journey.legs) ? journey.legs : [];
  const transfers = parsed?.totalTransfers !== undefined
    ? parsed.totalTransfers
    : (journey.numberOfTransfers ?? (journey.isDirectTrain ? 0 : 0));
  const isPureDirect = transfers === 0 && !hasStationDifference;

  const transportModes = Array.isArray(journey.transportModes) && journey.transportModes.length > 0
    ? journey.transportModes
    : ['rail'];

  const PrimaryModeIcon = getModeIcon(transportModes[0] || 'rail');
  const actualTrainName = trainStage?.trainName || journey.metadata?.trainName || journey.trainName || legs[0]?.service?.name || journey.service?.name || 'Express';

  const isBestOverall = Boolean(isTopPick);
  const rankingLabel = isTopPick ? 'Best Overall' : (journey.ranking?.label !== 'Best Overall' ? journey.ranking?.label : null);

  const isUnreserved = Boolean(
    journey.isUnreserved ||
    journey.metadata?.isUnreserved ||
    journey.availabilityStatus === 'UNRESERVED' ||
    journey.metadata?.availabilityStatus === 'UNRESERVED' ||
    journey.availability?.normalizedStatus === 'UNRESERVED' ||
    journey.legs?.some((l) => l.booking?.status === 'unreserved' || l.availability?.normalizedStatus === 'UNRESERVED') ||
    /unreserved/i.test(journey.service?.class || '') ||
    /passenger|memu|demu|emu/i.test(actualTrainName || '') ||
    /passenger|memu|demu|emu/i.test(journey.service?.name || '')
  );

  const recommendationReasons = isBestOverall
    ? getRecommendationExplanation(journey, allJourneys)
    : [];

  return (
    <article
      className={`rounded-2xl border bg-[#12151A] p-5 sm:p-6 transition-all shadow-xl ${
        isBestOverall
          ? 'border-[#E8B04A]/50 shadow-lg shadow-[#E8B04A]/5 ring-1 ring-[#E8B04A]/20'
          : 'border-[#232830] hover:border-[#3A414C]'
      }`}
      aria-label={`Journey from ${originName} to ${destinationName}, ${durationText}, ${priceLabel} ${priceText}`}
    >
      {/* 1. Header: Status & Classification Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232830] pb-3 sm:pb-3.5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Best Overall Badge */}
          {isBestOverall && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E8B04A] px-2.5 py-0.5 text-[10px] font-bold text-[#0B0D10] shadow-sm shrink-0">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              <span>BEST OVERALL</span>
            </span>
          )}

          {/* Ranking Badge */}
          {!isBestOverall && rankingLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#181C22] px-2.5 py-0.5 text-[11px] font-semibold text-[#9AA3AF] border border-[#232830] shrink-0">
              <span>{rankingLabel}</span>
            </span>
          )}

          {/* Transport Mode & Service / Train */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#EDEFF2] min-w-0">
            <PrimaryModeIcon className="h-3.5 w-3.5 text-[#E8B04A] shrink-0" aria-hidden="true" />
            <span className="uppercase">{transportModes.join(' + ')}</span>
            {actualTrainName && (
              <span className="text-[#9AA3AF] truncate max-w-[200px] sm:max-w-[320px]" title={actualTrainName}>
                · {actualTrainName}
              </span>
            )}
          </div>

          {/* Direct or Multi-Stage Connection Status */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0 ${
              transfers === 0
                ? 'bg-[#4CC38A]/10 text-[#4CC38A] border border-[#4CC38A]/20'
                : 'bg-[#181C22] text-[#E8B04A] border border-[#E8B04A]/30'
            }`}
          >
            {transfers === 0
              ? (hasStationDifference ? `DIRECT · VIA ${trainFromCode || 'NEARBY'}` : 'DIRECT')
              : `${formatTransfers(transfers)}`}
          </span>

          {/* Seat Availability Status Badge */}
          {isUnreserved ? (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
              Unreserved
            </span>
          ) : (
            <>
              {((journey.availabilityStatus || journey.metadata?.availabilityStatus) === 'AVAILABILITY_VERIFIED' ||
                ((journey.availabilityStatus || journey.metadata?.availabilityStatus) === 'AVAILABLE' && journey.isBookable)) && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-[#4CC38A]/10 text-[#4CC38A] border border-[#4CC38A]/20 shrink-0">
                  Seats Verified
                </span>
              )}
              {((journey.availabilityStatus || journey.metadata?.availabilityStatus) === 'RAC_AVAILABLE' ||
                (journey.availabilityStatus || journey.metadata?.availabilityStatus) === 'RAC' ||
                (journey.availabilityStatus || journey.metadata?.availabilityStatus) === 'RAC_ONLY') && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-[#E8B04A]/10 text-[#E8B04A] border border-[#E8B04A]/20 shrink-0">
                  RAC
                </span>
              )}
              {((journey.availabilityStatus || journey.metadata?.availabilityStatus) === 'WAITLIST_ONLY' ||
                (journey.availabilityStatus || journey.metadata?.availabilityStatus) === 'WAITLIST') && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-[#E07B39]/10 text-[#E07B39] border border-[#E07B39]/20 shrink-0">
                  Waitlist
                </span>
              )}
              {journey.availabilityStatus === 'NOT_BOOKABLE' && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                  Not Bookable
                </span>
              )}
            </>
          )}
        </div>

        {/* Header Actions: Compare & Save */}
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          {onToggleCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(journey)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                isCompared
                  ? 'bg-[#E8B04A] text-[#0B0D10] font-bold'
                  : 'bg-[#181C22] text-[#9AA3AF] hover:text-[#EDEFF2] border border-[#232830] hover:border-[#3A414C]'
              }`}
              title="Add to comparison"
              aria-label={isCompared ? 'Remove from comparison' : 'Compare journey'}
            >
              <GitCompare className="h-3.5 w-3.5" />
              <span>{isCompared ? 'Compared' : 'Compare'}</span>
            </button>
          )}

          {isAuthenticated && (
            <button
              type="button"
              onClick={handleToggleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors cursor-pointer ${
                saved
                  ? 'text-[#E8B04A] bg-[#E8B04A]/10'
                  : 'text-[#6B7480] hover:text-[#EDEFF2]'
              }`}
              title={saved ? 'Remove saved journey' : 'Save for later'}
              aria-label={saved ? 'Remove saved journey' : 'Save journey'}
            >
              <Bookmark className={`h-3.5 w-3.5 ${saved ? 'fill-[#E8B04A] text-[#E8B04A]' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Recommendation Explanation */}
      {isBestOverall && recommendationReasons.length > 0 && (
        <div className="mt-3.5 rounded-xl border border-[#E8B04A]/20 bg-[#181C22] p-3 text-xs space-y-2">
          <div className="font-semibold text-[#E8B04A] flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 shrink-0" />
            <span>Why Yatrai recommends this</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-x-4 text-[#9AA3AF]">
            {recommendationReasons.map((reason, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#4CC38A] shrink-0" aria-hidden="true" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Section 3: Collapsed Journey Card Structure */}
      {/* Route Context Banner: Requested Journey vs Actual Train Route */}
      {hasStationDifference && (
        <div className="mt-3.5 rounded-xl border border-[#232830] bg-[#181C22] p-3 sm:p-3.5 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Requested Journey */}
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7480]">
                REQUESTED JOURNEY
              </div>
              <div className="font-bold text-sm text-[#EDEFF2] flex items-center gap-1.5 flex-wrap">
                <span>{originName}</span>
                {originCode && <span className="font-mono text-xs text-[#6B7480]">({originCode})</span>}
                <ArrowRight className="h-3 w-3 text-[#6B7480] shrink-0" />
                <span>{destinationName}</span>
                {destinationCode && <span className="font-mono text-xs text-[#6B7480]">({destinationCode})</span>}
              </div>
            </div>

            {/* Actual Train Route */}
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#E8B04A]">
                ACTUAL TRAIN ROUTE
              </div>
              <div className="font-bold text-sm text-[#EDEFF2] flex items-center gap-1.5 flex-wrap">
                <span>{trainFromName}</span>
                {trainFromCode && <span className="font-mono text-xs text-[#E8B04A]">({trainFromCode})</span>}
                <ArrowRight className="h-3 w-3 text-[#E8B04A] shrink-0" />
                <span>{trainToName}</span>
                {trainToCode && <span className="font-mono text-xs text-[#E8B04A]">({trainToCode})</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Scannable 4-point Metrics & Action CTAs */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
        {/* Departure, Duration Line, Arrival */}
        <div className="sm:col-span-8 flex items-start justify-between gap-3 sm:gap-4">
          {/* Departure */}
          <div className="flex-1 min-w-0">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#EDEFF2] font-mono tabular-nums">
              {depTime}
            </div>
            <div className="mt-1 text-sm font-semibold text-[#EDEFF2] leading-snug break-words">
              {trainFromName}
              {trainFromCode && <span className="text-[#6B7480] font-mono text-xs ml-1">({trainFromCode})</span>}
            </div>
            {depDate && <div className="text-xs text-[#6B7480] mt-0.5">{depDate}</div>}
            {parsed?.hasOriginShift && (
              <div className="text-[10px] font-bold text-[#E8B04A] uppercase tracking-wider mt-1">
                Actual Boarding
              </div>
            )}
          </div>

          {/* Route path line & Duration */}
          <div className="flex flex-col items-center px-1 sm:px-2 flex-1 max-w-[140px] sm:max-w-[190px] shrink-0 pt-1">
            <div className="flex items-center gap-1 text-xs font-bold text-[#EDEFF2] font-mono">
              <Clock className="h-3 w-3 text-[#E8B04A] shrink-0" aria-hidden="true" />
              <span>{durationText}</span>
            </div>

            <div className="relative mt-2 w-full flex items-center justify-center">
              <div className="h-px w-full bg-[#232830]" />
              <div className="absolute flex h-2 w-2 rounded-full bg-[#E8B04A] ring-4 ring-[#12151A]" />
              <ArrowRight className="absolute right-0 h-3 w-3 text-[#6B7480] translate-x-0.5" aria-hidden="true" />
            </div>

            <div className="mt-1 text-[11px] text-[#6B7480] text-center">
              {transfers === 0
                ? (hasStationDifference ? `Direct (${trainFromCode || 'Nearby'})` : 'Direct')
                : formatTransfers(transfers)}
              {journey.totalDistance ? ` · ${journey.totalDistance} km` : ''}
            </div>
          </div>

          {/* Arrival with Mandatory Day Offset */}
          <div className="flex-1 min-w-0 text-right">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#EDEFF2] font-mono tabular-nums flex items-baseline justify-end gap-1.5">
              <span>{arrTime}</span>
              {dayOffsetBadge && (
                <span className="rounded-md bg-[#E8B04A]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#E8B04A] border border-[#E8B04A]/30">
                  {dayOffsetBadge}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm font-semibold text-[#EDEFF2] leading-snug break-words">
              {trainToName}
              {trainToCode && <span className="text-[#6B7480] font-mono text-xs ml-1">({trainToCode})</span>}
            </div>
            {arrDate && <div className="text-xs text-[#6B7480] mt-0.5">{arrDate}</div>}
            {parsed?.hasDestShift && (
              <div className="text-[10px] font-bold text-[#E8B04A] uppercase tracking-wider mt-1">
                Actual Arrival
              </div>
            )}
          </div>
        </div>

        {/* Fare & CTAs Column */}
        <div className="sm:col-span-4 flex flex-col sm:items-end justify-between pt-3 sm:pt-0 sm:border-l sm:border-[#232830] sm:pl-6 border-t border-[#232830] sm:border-t-0 gap-3">
          <div className="flex sm:flex-col justify-between sm:justify-start items-baseline sm:items-end w-full">
            <div className="text-[10px] uppercase tracking-wider text-[#6B7480] sm:text-right font-medium">
              {priceLabel}
            </div>
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-[#EDEFF2] sm:text-right font-mono tabular-nums">
              {priceText}
            </div>
            {parsed?.costs?.hasMissingCosts && (
              <div className="text-[10px] text-[#E07B39] sm:text-right mt-0.5">
                Local transport fare not included
              </div>
            )}
          </div>

          {/* Primary & Secondary Action CTAs */}
          <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            {/* Primary CTA: View Complete Itinerary (Amber #E8B04A button with dark #0B0D10 text) */}
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#E8B04A] hover:bg-[#F0C066] active:bg-[#D9A139] px-4 py-2.5 text-xs font-bold text-[#0B0D10] shadow-md transition-all cursor-pointer focus:outline-none"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse complete itinerary' : 'View complete itinerary'}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>{isExpanded ? 'Hide Complete Itinerary' : 'View Complete Itinerary'}</span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            {/* Route Map inspection */}
            {onViewJourney && (
              <button
                type="button"
                onClick={() => onViewJourney(journey)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] hover:bg-[#232830] hover:border-[#3A414C] px-3.5 py-2 text-xs font-semibold text-[#9AA3AF] hover:text-[#EDEFF2] transition-all cursor-pointer"
                aria-label={`View map for ${originName} to ${destinationName}`}
              >
                <MapPin className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
                <span>Route map</span>
              </button>
            )}

            {/* Railway Journey Guidelines Action */}
            <button
              type="button"
              onClick={() => setBookingModalOpen(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#232830] bg-[#181C22] hover:bg-[#232830] hover:border-[#3A414C] px-3.5 py-2 text-xs font-semibold text-[#9AA3AF] hover:text-[#EDEFF2] transition-all cursor-pointer"
              aria-label="View railway booking guidelines"
            >
              <Ticket className="h-3.5 w-3.5 text-[#E8B04A]" aria-hidden="true" />
              <span>Booking guidelines</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Section 4 & 5: Expanded Complete Journey Timeline */}
      {isExpanded && (
        <div className="mt-5 border-t border-[#232830] pt-5 animate-in fade-in">
          <CompleteJourneyTimeline
            journey={journey}
            onViewMap={onViewJourney ? () => onViewJourney(journey) : null}
            onOpenBooking={() => setBookingModalOpen(true)}
          />
        </div>
      )}

      {/* Booking Preparation & IRCTC Compliance Modal */}
      {bookingModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setBookingModalOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-[#232830] bg-[#181C22] p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#232830] pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="h-5 w-5 text-[#E8B04A]" />
                <h3 className="text-base font-bold text-[#EDEFF2]">Railway Booking Guidelines</h3>
              </div>
              <button
                type="button"
                onClick={() => setBookingModalOpen(false)}
                className="rounded-lg p-1 text-[#6B7480] hover:text-[#EDEFF2] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-[#9AA3AF] space-y-2">
              <p className="font-semibold text-[#EDEFF2]">
                {isPureDirect
                  ? 'Direct Train Booking'
                  : 'Multi-Leg Alternative Journey (Legs Booked Separately)'}
              </p>
              <p>
                {isPureDirect
                  ? 'This journey is operated as a single direct train. You can book directly using the train number below on IRCTC or an authorized booking partner.'
                  : (hasStationDifference
                      ? 'Per Indian Railways (IRCTC) booking regulations, connecting journeys cannot be issued under a single unified ticket. Each leg must be booked independently using its specific train number and boarding station. Seat availability is verified for the main train; check the connecting trains on IRCTC.'
                      : 'Per Indian Railways (IRCTC) booking regulations, connecting journeys cannot be issued under a single unified ticket. Each leg must be booked independently using its specific train number and boarding station. Yatrai has verified seat availability for each leg.')}
              </p>
            </div>

            {/* Leg breakdown list */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(legs.length > 0 ? legs : (trainStage ? [trainStage.leg || {
                sequence: 1,
                originStation: { code: trainFromCode, name: trainFromName },
                destinationStation: { code: trainToCode, name: trainToName },
                price: rawPrice,
                service: { number: trainStage.trainNumber, name: trainStage.trainName, class: trainStage.travelClass },
                availability: trainStage.availability
              }] : [])).map((leg, i) => {
                const isTransfer = Boolean(leg.metadata?.isStationTransfer || leg.mode === 'road');
                const isFeeder = Boolean(leg.metadata?.isFeeder);
                const legFare = leg.price != null && leg.price > 0 ? leg.price : null;
                const legAvailStatus = isFeeder
                  ? 'Not verified — check on IRCTC'
                  : (leg.availability?.normalizedStatus || leg.availability?.status || 'UNKNOWN');
                const legRawStatus = isFeeder
                  ? 'Not verified — check on IRCTC'
                  : (leg.availability?.rawStatus || '');

                const trainNum = leg.service?.number || leg.trainNumber || leg.vehicle?.identifier;
                const trainNumLabel = trainNum ? ` (#${trainNum})` : '';
                const legTitle = isTransfer
                  ? 'Local transfer'
                  : `${leg.service?.name || 'Train'}${trainNumLabel}`;

                const legFrom = resolveStation(
                  leg.originStation || leg.origin,
                  leg.metadata?.fromStationCode || (leg.metadata?.isMainTrain || !isTransfer ? parsed?.trainFromCode : null),
                  leg.metadata?.fromStationName
                );
                const legTo = resolveStation(
                  leg.destinationStation || leg.destination,
                  leg.metadata?.toStationCode || (leg.metadata?.isMainTrain || !isTransfer ? parsed?.trainToCode : null),
                  leg.metadata?.toStationName
                );

                return (
                  <div key={i} className="rounded-xl border border-[#232830] bg-[#12151A] p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-[#EDEFF2]">
                      <span>Leg {i + 1}: {legTitle}</span>
                      <span className={legFare ? 'text-[#4CC38A] font-mono' : 'text-[#6B7480] font-normal'}>
                        {isTransfer
                          ? 'Local transfer · fare not included'
                          : (legFare
                              ? (leg.isEstimated || leg.pricing?.isEstimated || leg.fareSource === 'estimate'
                                  ? `Est. ₹${legFare} (distance-based)`
                                  : `₹${legFare}`)
                              : 'Fare unavailable')}
                      </span>
                    </div>
                    <div className="text-[#9AA3AF]">
                      {legFrom.name} {legFrom.code && <span className="font-mono text-xs text-[#6B7480]">({legFrom.code})</span>} → {legTo.name} {legTo.code && <span className="font-mono text-xs text-[#6B7480]">({legTo.code})</span>}
                    </div>
                    {!isTransfer && (
                      <div className="flex items-center gap-2 text-[11px] text-[#6B7480]">
                        <span>Class: {leg.service?.class || 'SL'}</span>
                        <span>· Status: {legRawStatus || legAvailStatus}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total Fare & Compliance Warning */}
            <div className="flex items-center justify-between border-t border-[#232830] pt-2 text-xs">
              <span className="text-[#9AA3AF] font-medium">{priceLabel}:</span>
              <span className="text-base font-bold font-mono text-[#EDEFF2]">{priceText}</span>
            </div>

            <div className="rounded-xl border border-[#E8B04A]/20 bg-[#E8B04A]/10 p-3 text-xs text-[#E8B04A] flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#E8B04A] mt-0.5" />
              <span>
                Yatrai does not store sensitive payment details or auto-book without your explicit IRCTC account authorization.
              </span>
            </div>

            <div className="rounded-xl border border-[#232830] bg-[#12151A] p-3 text-[11px] text-[#6B7480] flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#6B7480] mt-0.5" />
              <span>
                Availability and fares shown are indicative and may have changed.
                Book on{' '}
                <a href="https://www.irctc.co.in" target="_blank" rel="noopener noreferrer" className="text-[#E8B04A] hover:underline">
                  IRCTC
                </a>{' '}
                for confirmed status.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBookingModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#9AA3AF] hover:text-[#EDEFF2] cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                id="modal-book-now-btn"
                onClick={handleBookNow}
                disabled={bookingLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E8B04A] hover:bg-[#F0C066] active:bg-[#D9A139] px-5 py-2.5 text-xs font-bold text-[#0B0D10] shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {bookingLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Book Now</span>
                    <Ticket className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
            {bookingError && (
              <p className="text-xs text-[#E5484D] text-right mt-1">{bookingError}</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default JourneyResultCard;
