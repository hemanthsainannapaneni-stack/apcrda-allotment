/**
 * Geographic helpers. Deliberately free of any mapping library so the table can
 * ask "is this plot mapped?" without pulling Leaflet into the main bundle.
 */

/** The capital city, centred near the Secretariat at Velagapudi. */
export const AMARAVATI = { lat: 16.5147, lng: 80.5183 };

/** "16.5183,80.5150" → coordinates, or null if the field holds anything else. */
export function parseGisRef(ref?: string | null): { lat: number; lng: number } | null {
  if (!ref) return null;
  const [lat, lng] = ref.split(',').map((n) => Number(n.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
