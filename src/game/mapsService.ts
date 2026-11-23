import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import type { DistrictPreset, LatLng, StructureRecord } from './types';
import {
  classifyPlaceTypeToArchetype,
  projectLatLngToWorld,
  snapStructureOffRoads,
} from './worldMath';

const ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

let loaderConfigured = false;
let mapsReadyPromise: Promise<boolean> | null = null;

export interface GoogleMapsQuotaState {
  quotaExceeded: boolean;
}

/**
 * Registers Tier 1 global listeners for Google Maps Platform Demo Key quota errors.
 */
export function registerGmpQuotaListeners(): void {
  const win = window as unknown as Record<string, unknown>;
  win.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    const msg = args.map((a) => String(a)).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };
}

function getApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

function isQuotaError(err: unknown): boolean {
  const txt = String(err || '');
  return (
    txt.includes('RESOURCE_EXHAUSTED') ||
    txt.includes('OVER_QUERY_LIMIT') ||
    txt.includes('OverQuotaMapError') ||
    txt.includes('429')
  );
}

/**
 * Ensures the Maps JavaScript API loader is configured once with Sri Lanka region bias.
 */
export async function ensureGoogleMapsLoaded(): Promise<boolean> {
  const key = getApiKey();
  if (!key) {
    return false;
  }

  if (!loaderConfigured) {
    setOptions({
      key,
      v: 'weekly',
      language: 'en',
      region: 'LK',
    });
    loaderConfigured = true;
  }

  if (!mapsReadyPromise) {
    mapsReadyPromise = importLibrary('maps')
      .then(() => true)
      .catch((err) => {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        return false;
      });
  }

  return mapsReadyPromise;
}

/**
 * Queries real nearby buildings, hotels, temples, museums, and landmarks in Sri Lanka
 * using the modern Places API (New) `Place.searchNearby()` and projects their exact
 * latitude/longitude into 1:1 metric 3D world coordinates.
 * Doc: https://developers.google.com/maps/documentation/javascript/nearby-search?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */
export async function fetchDistrictStructuresFromGoogleMaps(
  district: DistrictPreset,
  existingPositions: { x: number; z: number }[],
): Promise<{ structures: StructureRecord[]; live: boolean }> {
  const ok = await ensureGoogleMapsLoaded();
  if (!ok) {
    return { structures: [], live: false };
  }

  try {
    const placesLib = (await importLibrary('places')) as google.maps.PlacesLibrary;
    const { Place, SearchNearbyRankPreference } = placesLib;

    const request: google.maps.places.SearchNearbyRequest & {
      internalUsageAttributionIds?: string[];
    } = {
      fields: ['displayName', 'location', 'primaryType', 'formattedAddress', 'googleMapsURI'],
      locationRestriction: {
        center: { lat: district.center.lat, lng: district.center.lng },
        radius: 1400,
      },
      includedPrimaryTypes: [
        'tourist_attraction',
        'hotel',
        'museum',
        'restaurant',
        'shopping_mall',
        'hindu_temple',
        'buddhist_temple',
        'historical_landmark',
        'government_office',
        'cafe',
      ],
      maxResultCount: 14,
      rankPreference: SearchNearbyRankPreference.POPULARITY,
      language: 'en',
      region: 'LK',
      internalUsageAttributionIds: [ATTRIBUTION_ID],
    };

    const response = await Place.searchNearby(request);
    const places = response?.places ?? [];
    const results: StructureRecord[] = [];
    const occupied = existingPositions.map((p) => ({ x: p.x, z: p.z }));

    const accentPalette = [0xf5b942, 0xe85d3f, 0x3b82f6, 0x2dd4bf, 0xdf4c8c, 0xc97b3e];

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      if (!place?.location || !place.displayName) continue;

      const lat =
        typeof place.location.lat === 'function' ? place.location.lat() : Number(place.location.lat);
      const lng =
        typeof place.location.lng === 'function' ? place.location.lng() : Number(place.location.lng);

      const spec = classifyPlaceTypeToArchetype(place.primaryType ?? undefined);
      const projected = projectLatLngToWorld({ lat, lng }, district.center, 0.14, 92);
      const snapped = snapStructureOffRoads(
        projected.x,
        projected.z,
        spec.width * 0.5,
        spec.depth * 0.5,
        district.hasOceanWest ? -58 : -92,
      );

      // Avoid colliding directly on top of another building footprint
      const overlaps = occupied.some(
        (o) => Math.hypot(o.x - snapped.x, o.z - snapped.z) < 16.5,
      );
      if (overlaps) continue;

      occupied.push({ x: snapped.x, z: snapped.z });

      results.push({
        id: place.id || `gmp-place-${i}`,
        name: place.displayName,
        archetype: spec.archetype,
        source: 'google_maps',
        x: snapped.x,
        z: snapped.z,
        width: spec.width,
        depth: spec.depth,
        height: spec.height,
        rotationY: snapped.x > 0 ? -Math.PI / 2 : Math.PI / 2,
        lat,
        lng,
        address: place.formattedAddress ?? undefined,
        primaryType: place.primaryType ?? undefined,
        googleMapsURI: place.googleMapsURI ?? undefined,
        accentColor: accentPalette[i % accentPalette.length],
      });
    }

    return { structures: results, live: true };
  } catch (err) {
    if (isQuotaError(err)) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    return { structures: [], live: false };
  }
}

/**
 * Interactive Google Map controller used inside the `[G]` Colombo Sector Explorer modal.
 * Renders a real `google.maps.Map` with `AdvancedMarkerElement` pins and mandatory attribution.
 */
export class ColomboMapExplorer {
  private map: google.maps.Map | null = null;
  private markers: google.maps.marker.AdvancedMarkerElement[] = [];
  private playerMarker: google.maps.marker.AdvancedMarkerElement | null = null;
  private mountedContainer: HTMLElement | null = null;

  async mount(
    container: HTMLElement,
    center: LatLng,
    structures: StructureRecord[],
    playerPos: LatLng,
    onSelectStructure: (s: StructureRecord) => void,
  ): Promise<boolean> {
    const ok = await ensureGoogleMapsLoaded();
    if (!ok) return false;

    try {
      const [{ Map: GoogleMap }, { AdvancedMarkerElement }] = await Promise.all([
        importLibrary('maps') as Promise<google.maps.MapsLibrary>,
        importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
      ]);

      if (!this.map || this.mountedContainer !== container) {
        this.mountedContainer = container;
        this.map = new GoogleMap(container, {
          center,
          zoom: 15,
          mapId: 'DEMO_MAP_ID',
          gestureHandling: 'greedy',
          streetViewControl: false,
          fullscreenControl: false,
          internalUsageAttributionIds: [ATTRIBUTION_ID],
        } as google.maps.MapOptions);
      } else {
        this.map.setCenter(center);
      }

      // Clear previous markers
      for (const m of this.markers) {
        m.map = null;
      }
      this.markers = [];

      // Structure pins: highlight live Google Maps POIs with gold label badges and keep base landmarks compact
      for (const s of structures) {
        const isLive = s.source === 'google_maps';
        const pinEl = document.createElement('div');
        if (isLive) {
          pinEl.style.cssText =
            'background:#121015;color:#ffd670;border:2px solid #f5b942;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.6);cursor:pointer;';
          pinEl.textContent = s.name;
        } else {
          pinEl.style.cssText =
            'width:11px;height:11px;border-radius:50%;background:#e85d3f;border:2px solid #121015;box-shadow:0 2px 6px rgba(0,0,0,0.5);cursor:pointer;';
        }

        const marker = new AdvancedMarkerElement({
          map: this.map,
          position: { lat: s.lat, lng: s.lng },
          title: s.name,
        });
        marker.append(pinEl);
        pinEl.addEventListener('click', () => onSelectStructure(s));
        this.markers.push(marker);
      }

      // Live Player GPS marker
      if (this.playerMarker) {
        this.playerMarker.map = null;
      }
      const pEl = document.createElement('div');
      pEl.style.cssText =
        'width:16px;height:16px;border-radius:50%;background:#4fd18b;border:3px solid #121015;box-shadow:0 0 0 3px #4fd18b;';
      this.playerMarker = new AdvancedMarkerElement({
        map: this.map,
        position: playerPos,
        title: 'Kasun (Player GPS)',
      });
      this.playerMarker.append(pEl);

      return true;
    } catch (err) {
      if (isQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      return false;
    }
  }

  updatePlayer(pos: LatLng): void {
    if (this.playerMarker) {
      this.playerMarker.position = pos;
    }
  }
}
