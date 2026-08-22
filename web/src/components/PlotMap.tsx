/**
 * GIS view of the plot registry.
 *
 * Every plot carries a `gisRef` of "latitude,longitude". This drops those onto
 * a real map of the Amaravati capital region so an officer can see where a
 * parcel actually sits — which theme city it falls in, what it adjoins, and how
 * far it is from the river — rather than reading a survey number and guessing.
 *
 * The circle around each plot is drawn to its real extent, so a 54-acre stadium
 * parcel looks like one next to a 6-acre tower plot.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AMARAVATI, parseGisRef } from '../lib/gis';

/** Availability drives the marker colour, matching the badges in the table. */
const FILL: Record<string, string> = {
  AVAILABLE: '#0ca30c',
  RESERVED: '#fab219',
  ALLOTTED: '#2f5f95',
  WITHDRAWN: '#8f9bad',
};

export type MapPlot = {
  id: string;
  code: string;
  name: string;
  gisRef?: string | null;
  surveyRef?: string;
  extentAcres: number;
  themeCity?: string;
  landUse?: string;
  availability: string;
};

/** Radius in metres of a circle covering the same ground as `acres`. */
function radiusFor(acres: number) {
  return Math.max(40, Math.sqrt(Math.max(acres, 0.1) * 4046.86 / Math.PI));
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export default function PlotMap({
  plots,
  focusId,
  height = 460,
}: {
  plots: MapPlot[];
  /** Zooms to this plot and opens its popup; otherwise the whole set is framed. */
  focusId?: string;
  height?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!holder.current) return;

    const map = L.map(holder.current, { scrollWheelZoom: true }).setView([AMARAVATI.lat, AMARAVATI.lng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const located = plots
      .map((p) => ({ plot: p, at: parseGisRef(p.gisRef) }))
      .filter((row): row is { plot: MapPlot; at: { lat: number; lng: number } } => row.at !== null);

    let focused: L.CircleMarker | null = null;
    const points: L.LatLngExpression[] = [];

    for (const { plot, at } of located) {
      const isFocus = plot.id === focusId;
      const colour = FILL[plot.availability] ?? FILL.WITHDRAWN;
      points.push([at.lat, at.lng]);

      // The parcel footprint, to scale.
      L.circle([at.lat, at.lng], {
        radius: radiusFor(plot.extentAcres),
        color: colour,
        weight: isFocus ? 2 : 1,
        opacity: isFocus ? 0.9 : 0.45,
        fillColor: colour,
        fillOpacity: isFocus ? 0.25 : 0.1,
      }).addTo(map);

      const marker = L.circleMarker([at.lat, at.lng], {
        radius: isFocus ? 9 : 6,
        color: '#ffffff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 1,
      }).addTo(map);

      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.5">
           <strong style="font-family:ui-monospace,monospace">${escapeHtml(plot.code)}</strong><br/>
           ${escapeHtml(plot.name)}<br/>
           <span style="color:#6b7789">
             ${plot.extentAcres.toFixed(2)} ac${plot.themeCity ? ` · ${escapeHtml(plot.themeCity)}` : ''}<br/>
             ${plot.landUse ? `${escapeHtml(plot.landUse)} · ` : ''}${escapeHtml(plot.availability)}<br/>
             ${plot.surveyRef ? escapeHtml(plot.surveyRef) : ''}
           </span>
         </div>`
      );

      if (isFocus) focused = marker;
    }

    if (focused) {
      const at = focused.getLatLng();
      map.setView(at, 16);
      focused.openPopup();
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points).pad(0.2));
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }

    // The container is sized by CSS, which Leaflet cannot see until it paints.
    const settle = setTimeout(() => map.invalidateSize(), 60);

    return () => {
      clearTimeout(settle);
      map.remove();
    };
  }, [plots, focusId]);

  return (
    <div>
      <div
        ref={holder}
        style={{ height }}
        className="w-full overflow-hidden rounded-md border border-ink-200"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
        {Object.entries(FILL).map(([status, colour]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </span>
        ))}
        <span className="ml-auto">Circles are drawn to each plot's real extent.</span>
      </div>
    </div>
  );
}
