import React, { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { journeyToGeoJSON } from './journeyGeoJson.js';
import { SchematicRouteFallback } from './SchematicRouteFallback.jsx';
import { Loader2, Maximize2, RotateCcw, AlertTriangle } from 'lucide-react';

/**
 * JourneyMap Component (Phase 12)
 *
 * Dedicated Mapbox GL JS journey route visualization component.
 * Renders canonical multi-modal journeys, stops, transfers, and interactive popups.
 * Gracefully degrades to SchematicRouteFallback if WebGL is unavailable or token is absent.
 *
 * @param {Object} props
 * @param {Object} props.journey - Canonical journey data
 * @param {number|null} [props.selectedLegSequence=null] - Currently focused leg sequence
 * @param {Function} [props.onSelectLeg] - Callback when user clicks a leg
 * @param {string} [props.className]
 */
export function JourneyMap({
  journey,
  selectedLegSequence = null,
  onSelectLeg,
  className = '',
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);

  const [mapState, setMapState] = useState({
    status: 'idle', // 'idle' | 'loading' | 'ready' | 'error' | 'unsupported'
    error: null,
  });

  // Read public Mapbox access token from Vite environment
  const mapboxToken =
    import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
    import.meta.env.VITE_MAPBOX_TOKEN ||
    '';

  // Derive GeoJSON structures deterministically
  const geoData = useMemo(() => {
    return journeyToGeoJSON(journey, selectedLegSequence);
  }, [journey, selectedLegSequence]);

  // Store current props in refs for initialization event handlers
  const onSelectLegRef = useRef(onSelectLeg);
  onSelectLegRef.current = onSelectLeg;

  const geoDataRef = useRef(geoData);
  geoDataRef.current = geoData;

  // Check WebGL and token availability
  const isMapboxUsable = useMemo(() => {
    if (!mapboxToken || !mapboxToken.trim()) return false;
    try {
      return Boolean(mapboxgl.supported && mapboxgl.supported());
    } catch {
      return false;
    }
  }, [mapboxToken]);

  // Fit bounds helper
  const fitMapToBounds = (map, bounds) => {
    if (!map || !bounds) return;
    try {
      map.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 13,
        duration: 900,
      });
    } catch {
      // Ignore bounds fitting errors
    }
  };

  // Initialize Mapbox map instance
  useEffect(() => {
    if (!isMapboxUsable || !mapContainerRef.current) {
      return;
    }

    let isCancelled = false;
    setMapState({ status: 'loading', error: null });

    try {
      mapboxgl.accessToken = mapboxToken.trim();

      const defaultCenter = [77.209, 28.6139]; // Default to New Delhi coordinates
      const defaultZoom = 5;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: defaultCenter,
        zoom: defaultZoom,
        attributionControl: false,
      });

      // Add navigation controls
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');

      map.on('load', () => {
        if (isCancelled) return;

        try {
          const currentGeo = geoDataRef.current;

          // 1. Add Route Lines GeoJSON source
          map.addSource('journey-routes', {
            type: 'geojson',
            data: currentGeo.routes,
          });

          // 2. Add Route Casing Layer (outer glow / dark border)
          map.addLayer({
            id: 'route-line-casing',
            type: 'line',
            source: 'journey-routes',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#070A0F',
              'line-width': ['case', ['boolean', ['get', 'isSelected'], false], 8, 6],
              'line-opacity': 0.85,
            },
          });

          // 3. Add Colored Route Layer with mode-specific colors
          map.addLayer({
            id: 'route-lines',
            type: 'line',
            source: 'journey-routes',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': [
                'match',
                ['get', 'mode'],
                'rail', '#32D583',
                'train', '#32D583',
                'road', '#F5B942',
                'car', '#F5B942',
                'bus', '#4EA1FF',
                'flight', '#FF5C67',
                'air', '#FF5C67',
                '#7C5CFF',
              ],
              'line-width': ['case', ['boolean', ['get', 'isSelected'], false], 5, 3.5],
              'line-opacity': ['case', ['boolean', ['get', 'isSelected'], false], 1.0, 0.75],
            },
          });

          // 4. Add Stops Points GeoJSON source
          map.addSource('journey-stops', {
            type: 'geojson',
            data: currentGeo.stops,
          });

          // 5. Add Stop Casing Outer Circle Layer
          map.addLayer({
            id: 'stops-casing',
            type: 'circle',
            source: 'journey-stops',
            paint: {
              'circle-radius': 8,
              'circle-color': '#0B0F16',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-opacity': 0.3,
            },
          });

          // 6. Add Stop Inner Circle Layer
          map.addLayer({
            id: 'stops-point',
            type: 'circle',
            source: 'journey-stops',
            paint: {
              'circle-radius': 6,
              'circle-color': [
                'match',
                ['get', 'type'],
                'origin', '#32D583',
                'destination', '#7C5CFF',
                'transfer', '#F5B942',
                '#4EA1FF',
              ],
            },
          });

          // 7. Add Stop Labels Layer
          map.addLayer({
            id: 'stops-labels',
            type: 'symbol',
            source: 'journey-stops',
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-offset': [0, 1.3],
              'text-anchor': 'top',
              'text-optional': true,
            },
            paint: {
              'text-color': '#F7F8FA',
              'text-halo-color': '#070A0F',
              'text-halo-width': 2,
            },
          });

          // Click on Route Line: Select Leg
          map.on('click', 'route-lines', (e) => {
            if (e.features && e.features[0] && onSelectLegRef.current) {
              const seq = e.features[0].properties.sequence;
              if (seq) onSelectLegRef.current(Number(seq));
            }
          });

          // Click on Stop Point: Show Information Popup
          map.on('click', 'stops-point', (e) => {
            if (!e.features || !e.features[0]) return;
            const feature = e.features[0];
            const coordinates = feature.geometry.coordinates.slice();
            const { name, label, type, fromMode, toMode } = feature.properties;

            if (popupRef.current) popupRef.current.remove();

            let popupContent = `
              <div style="font-family: sans-serif; font-size: 12px; color: #10151D; padding: 4px;">
                <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #7C5CFF;">
                  ${label || 'Station'}
                </div>
                <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">
                  ${name || 'Stop'}
                </div>
            `;

            if (type === 'transfer' && fromMode && toMode) {
              popupContent += `
                <div style="font-size: 11px; color: #666; margin-top: 4px;">
                  Connection: <strong>${fromMode}</strong> → <strong>${toMode}</strong>
                </div>
              `;
            }

            popupContent += `</div>`;

            popupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: false })
              .setLngLat(coordinates)
              .setHTML(popupContent)
              .addTo(map);
          });

          // Cursor styling
          map.on('mouseenter', 'route-lines', () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'route-lines', () => {
            map.getCanvas().style.cursor = '';
          });
          map.on('mouseenter', 'stops-point', () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'stops-point', () => {
            map.getCanvas().style.cursor = '';
          });

          // Fit to bounds
          if (currentGeo.bounds) {
            fitMapToBounds(map, currentGeo.bounds);
          }

          mapRef.current = map;
          setMapState({ status: 'ready', error: null });
        } catch (initErr) {
          setMapState({ status: 'error', error: initErr.message || 'Map layer initialization failed' });
        }
      });

      map.on('error', (e) => {
        if (!isCancelled) {
          // If a minor tile error occurs, do not crash ready map
          if (mapRef.current) return;
          setMapState({
            status: 'error',
            error: e.error?.message || 'Mapbox encountered an unexpected error',
          });
        }
      });

      // ResizeObserver to automatically resize map when container dimensions change
      const resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);

      return () => {
        isCancelled = true;
        resizeObserver.disconnect();
        if (popupRef.current) popupRef.current.remove();
        map.remove();
        mapRef.current = null;
      };
    } catch (err) {
      setMapState({ status: 'error', error: err.message || 'Mapbox initialization failed' });
    }
  }, [isMapboxUsable, mapboxToken]);

  // Update existing Mapbox sources when journey or selection changes without tearing down map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState.status !== 'ready') return;

    try {
      const routesSource = map.getSource('journey-routes');
      if (routesSource) {
        routesSource.setData(geoData.routes);
      }

      const stopsSource = map.getSource('journey-stops');
      if (stopsSource) {
        stopsSource.setData(geoData.stops);
      }

      if (geoData.bounds) {
        fitMapToBounds(map, geoData.bounds);
      }
    } catch {
      // Ignore update errors
    }
  }, [geoData, mapState.status]);

  // If Mapbox is not configured or unsupported, render the resilient SchematicRouteFallback
  if (!isMapboxUsable || mapState.status === 'unsupported') {
    return (
      <div className={className}>
        <SchematicRouteFallback
          journey={journey}
          selectedLegSequence={selectedLegSequence}
          onSelectLeg={onSelectLeg}
          reason="Topological Route Preview"
        />
      </div>
    );
  }

  // If map error occurred, allow retry or fallback
  if (mapState.status === 'error') {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center justify-between rounded-xl border border-semantic-warning/30 bg-surface-secondary p-3 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-semantic-warning shrink-0" aria-hidden="true" />
            <span>Mapbox failed to load tiles. Displaying topological route fallback.</span>
          </div>
          <button
            type="button"
            onClick={() => setMapState({ status: 'loading', error: null })}
            className="flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>

        <SchematicRouteFallback
          journey={journey}
          selectedLegSequence={selectedLegSequence}
          onSelectLeg={onSelectLeg}
          reason="Topological Route Preview"
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-surface-primary shadow-xl ${className}`}>
      {/* Map Container Viewport */}
      <div
        ref={mapContainerRef}
        className="h-64 sm:h-80 md:h-96 w-full bg-background-primary transition-all"
        style={{ minHeight: '260px' }}
        aria-label="Interactive Journey Map"
      />

      {/* Loading Overlay */}
      {mapState.status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-primary/80 backdrop-blur-xs z-10">
          <div className="flex items-center gap-2 rounded-xl bg-surface-elevated px-4 py-2 text-xs font-medium text-text-primary shadow-lg border border-white/10">
            <Loader2 className="h-4 w-4 animate-spin text-brand-primary" aria-hidden="true" />
            <span>Loading map route...</span>
          </div>
        </div>
      )}

      {/* Interactive Legend & Reset Bounds Control */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg bg-surface-primary/90 backdrop-blur-md px-3 py-1.5 border border-white/10 shadow-md text-[11px] text-text-secondary">
          <span className="flex items-center gap-1 font-medium">
            <span className="h-2 w-2 rounded-full bg-semantic-success" />
            <span>Origin</span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="h-2 w-2 rounded-full bg-semantic-warning" />
            <span>Transfer</span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="h-2 w-2 rounded-full bg-brand-primary" />
            <span>Destination</span>
          </span>
        </div>

        {geoData.bounds && mapRef.current && (
          <button
            type="button"
            onClick={() => fitMapToBounds(mapRef.current, geoData.bounds)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-surface-primary/90 backdrop-blur-md px-2.5 py-1.5 border border-white/10 shadow-md text-[11px] font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
            title="Reset map view to fit route"
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            <span>Fit Route</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default JourneyMap;
