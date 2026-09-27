import React from 'react';
import { Compass, Clock, MapPin, AlertCircle } from 'lucide-react';
import { getModeIcon } from '../journey/JourneyLeg.jsx';
import { getModeColor } from './mapUtils.js';

/**
 * SchematicRouteFallback Component
 *
 * Provides a resilient, high-fidelity visual route diagram when
 * Mapbox GL JS is unavailable, WebGL is unsupported, or an access token is not set.
 *
 * @param {Object} props
 * @param {Object} props.journey - Canonical journey data
 * @param {number|null} props.selectedLegSequence - Selected leg sequence for focus
 * @param {Function} props.onSelectLeg - Callback when a leg is clicked
 * @param {string} [props.reason] - Explanation message for fallback
 */
export function SchematicRouteFallback({
  journey,
  selectedLegSequence = null,
  onSelectLeg,
  reason = 'Schematic Route Preview',
}) {
  if (!journey) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-white/10 bg-surface-primary p-6 text-center text-xs text-text-tertiary">
        <div className="space-y-2">
          <Compass className="mx-auto h-8 w-8 text-text-disabled" aria-hidden="true" />
          <p>No journey route data available to visualize.</p>
        </div>
      </div>
    );
  }

  const legs = Array.isArray(journey.legs) && journey.legs.length > 0
    ? journey.legs
    : [
        {
          sequence: 1,
          mode: journey.transportModes?.[0] || 'rail',
          origin: journey.origin,
          destination: journey.destination,
          departureTime: journey.departureTime,
          arrivalTime: journey.arrivalTime,
          duration: journey.duration,
          distance: journey.totalDistance,
        },
      ];

  const originName = journey.origin?.name || journey.origin?.city || 'Origin';
  const destName = journey.destination?.name || journey.destination?.city || 'Destination';

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-surface-secondary/90 p-5 shadow-xl">
      {/* Fallback Banner Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {reason}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <Compass className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
          <span>Topological Journey Route</span>
        </div>
      </div>

      {/* Schematic Linear Pipeline Visualizer */}
      <div className="space-y-3 py-2">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {legs.map((leg, idx) => {
            const sequence = leg.sequence ?? idx + 1;
            const isSelected = selectedLegSequence !== null && sequence === Number(selectedLegSequence);
            const modeColor = getModeColor(leg.mode);
            const ModeIcon = getModeIcon(leg.mode);
            const legOrigin = leg.origin?.name || leg.origin?.city || (idx === 0 ? originName : 'Stop');
            const legDest = leg.destination?.name || leg.destination?.city || (idx === legs.length - 1 ? destName : 'Stop');

            return (
              <React.Fragment key={leg.id || idx}>
                {/* Leg Card Item */}
                <button
                  type="button"
                  onClick={() => onSelectLeg && onSelectLeg(sequence)}
                  className={`flex-1 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-brand-primary bg-surface-elevated shadow-md ring-1 ring-brand-primary/50'
                      : 'border-white/5 bg-surface-primary/80 hover:border-white/15 hover:bg-surface-elevated/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${modeColor}20`, color: modeColor }}
                      >
                        <ModeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: modeColor }}>
                        {leg.mode || 'Transit'}
                      </span>
                    </div>

                    <div className="text-[11px] text-text-tertiary flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <span>{leg.duration ? `${Math.round(leg.duration / 60)}h ${leg.duration % 60}m` : 'Direct'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                      <MapPin className="h-3 w-3 text-semantic-success shrink-0" aria-hidden="true" />
                      <span className="truncate">{legOrigin}</span>
                    </div>
                    <div className="ml-1.5 h-3 border-l border-dashed border-white/20" />
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                      <MapPin className="h-3 w-3 text-brand-primary shrink-0" aria-hidden="true" />
                      <span className="truncate">{legDest}</span>
                    </div>
                  </div>
                </button>

                {/* Arrow connector between legs on desktop */}
                {idx < legs.length - 1 && (
                  <div className="hidden md:flex items-center justify-center text-text-disabled shrink-0 px-1">
                    <span className="text-xs font-mono">→</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Legend / Status Hint */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-[11px] text-text-tertiary">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-semantic-success" />
            <span>Origin</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-semantic-warning" />
            <span>Transfer Stop</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-brand-primary" />
            <span>Destination</span>
          </span>
        </div>

        <div className="flex items-center gap-1 text-text-disabled">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Interactive map active when Mapbox token configured</span>
        </div>
      </div>
    </div>
  );
}

export default SchematicRouteFallback;
