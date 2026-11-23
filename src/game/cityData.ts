import type { DistrictPreset, InteriorKind, StructureRecord } from './types';
import { worldToLatLng } from './worldMath';

/**
 * Playable Sri Lankan districts centered on real coordinates.
 * Live Google Maps Places API (New) structures are queried around each
 * district's real latitude/longitude when selected or on load.
 */
export const SRI_LANKA_DISTRICTS: DistrictPreset[] = [
  {
    id: 'colombo_lotus',
    name: 'Colombo Fort & Lotus',
    subtitle: 'Galle Face Drive · Beira Lake · Nelum Kuluna Skyline',
    center: { lat: 6.9271, lng: 79.8565 },
    hasOceanWest: true,
    hasLakeEast: true,
  },
  {
    id: 'galle_face',
    name: 'Galle Face Oceanfront',
    subtitle: 'Coastal Esplanade · Promenade · Heritage Boulevard',
    center: { lat: 6.9244, lng: 79.8442 },
    hasOceanWest: true,
    hasLakeEast: false,
  },
  {
    id: 'kandy_city',
    name: 'Kandy Sacred City',
    subtitle: 'Hill Capital · Kandy Lake · Heritage Pavilion Quarter',
    center: { lat: 7.2936, lng: 80.6413 },
    hasOceanWest: false,
    hasLakeEast: true,
  },
  {
    id: 'galle_fort',
    name: 'Galle Dutch Fort',
    subtitle: 'Southern Ramparts · Colonial Arcades · Lighthouse Coast',
    center: { lat: 6.0267, lng: 80.217 },
    hasOceanWest: true,
    hasLakeEast: false,
  },
];

/**
 * Builds an expanded, dense 22-structure Colombo & Sri Lanka architectural skyline
 * including 4 seamless Walk-In Enterable Buildings (Pettah Tactical Armory,
 * Ceylon Kottu & Tea Café, Kasun's Coastal Safehouse, Colombo Heritage Bank),
 * plus the Lighthouse, Spice Kiosks, Lotus Tower, Twin Towers, and Temples.
 * All structures sit cleanly inside blocks between roads (-44, 0, +44).
 */
export function buildDistrictBaseStructures(district: DistrictPreset): StructureRecord[] {
  const mk = (
    id: string,
    name: string,
    archetype: StructureRecord['archetype'],
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    rotationY = 0,
    accentColor?: number,
    enterable?: InteriorKind,
    doorFacing?: 'north' | 'south' | 'east' | 'west',
  ): StructureRecord => {
    const ll = worldToLatLng(x, z, district.center);
    return {
      id,
      name,
      archetype,
      source: 'district_landmark',
      x,
      z,
      width,
      depth,
      height,
      rotationY,
      lat: ll.lat,
      lng: ll.lng,
      accentColor,
      enterable,
      doorFacing,
    };
  };

  return [
    // --- 4 SEAMLESS WALK-IN ENTERABLE BUILDINGS (Open Doorways + Furnished 3D Interiors!) ---
    // 1. Pettah Tactical Armory right on East sidewalk just ahead of spawn! (Door faces West toward Galle Face Ave)
    mk('in-armory', 'Pettah Tactical Armory', 'armory', 16.5, 19, 12, 11, 6.2, 0, 0xe85d3f, 'armory', 'west'),
    // 2. Ceylon Tea & Kottu Café directly across the avenue on West sidewalk! (Door faces East toward Galle Face Ave)
    mk('in-cafe', 'Ceylon Kottu & Tea Lounge', 'cafe_shop', -16.5, 19, 12, 11, 5.8, 0, 0x2a9d8f, 'cafe_shop', 'east'),
    // 3. Kasun's Coastal Villa Safehouse near NW Boulevard (Door faces East toward Central Ave)
    mk('in-safehouse', "Kasun's Coastal Safehouse", 'safehouse', -16.5, -16, 12, 11, 6.4, 0, 0xf5b942, 'safehouse', 'east'),
    // 4. Colombo Heritage Bank & Gold Vault (Door faces West toward Central Ave)
    mk('in-bank', 'Colombo Heritage Bank', 'bank_vault', 16.5, -15, 13, 12, 7.6, 0, 0xd4a24c, 'bank_vault', 'west'),

    // --- ICONIC COLOMBO & SRI LANKAN SKYLINE LANDMARKS ---
    // Iconic centerpiece Nelum Kuluna (Lotus Tower) rising tall behind the bank
    mk('lm-lotus', 'Lotus Spire Plaza', 'lotus_tower', 30, -29, 14, 14, 58, 0, 0xdf4c8c),
    // Twin Glass Commerce Towers (NW skyline)
    mk('lm-twins', 'Fort Twin Commerce Towers', 'twin_towers', -30, -28, 15, 13, 40, 0, 0x2b6cb0),
    // Galle Face / Colombo Harbour Lighthouse overlooking the Indian Ocean!
    mk('lm-lighthouse', 'Colombo Coastal Lighthouse', 'lighthouse', -56, -24, 9, 9, 27, 0, 0xf8f5ee),
    // Old Harbour Colonial Arcade (SW coastal corner)
    mk('lm-arcade', 'Old Harbour Colonial Arcade', 'colonial_arcade', -31, 28, 14, 12, 11, 0, 0xc8643c),
    // Pettah Bazaar Heritage Market (SE inner block)
    mk('lm-bazaar', 'Pettah Bazaar Arcade', 'pettah_bazaar', 31, 29, 13, 12, 13, 0, 0xb83232),
    // Vibrant Pettah Spice & Tea Kiosk Row
    mk('lm-kiosk-1', 'Main Street Spice Kiosks', 'kiosk_arcade', 29, 14, 10, 7, 4.8, 0, 0xf59e0b),
    mk('lm-kiosk-2', 'Galle Face Textile Stalls', 'kiosk_arcade', -30, 14, 10, 7, 4.8, 0, 0xdf4c8c),

    // --- OUTER RING SKYLINE & HERITAGE QUARTERS ---
    // High-rise oceanfront hotel (Far NW)
    mk('lm-hotel-nw', 'Oceanfront Grand Tower', 'hotel_tower', -22, -64, 16, 13, 32, 0, 0xd4a24c),
    mk('lm-hotel-nw2', 'Galle Face Regency Suites', 'hotel_tower', -30, -82, 14, 12, 24, 0, 0x3b82f6),
    // Commercial Plazas (Far NE)
    mk('lm-plaza-ne', 'Beira Business Plaza', 'commercial_plaza', 22, -64, 15, 13, 26, 0, 0x3a7d7c),
    mk('lm-plaza-ne2', 'Union Place Tech Tower', 'commercial_plaza', 28, -82, 14, 12, 22, 0, 0x6366f1),
    // Beira Lake Heritage Temple Pavilion (East quarter near lake)
    mk('lm-temple-e', 'Seema Malaka Lake Temple', 'temple_pavilion', 62, -22, 14, 14, 12, Math.PI / 2, 0xf2b949),
    // Colombo Central Police Precinct (East-South quarter)
    mk('lm-civic-se', 'Colombo Central Precinct', 'civic_hall', 62, 22, 15, 13, 15, Math.PI / 2, 0x2b5a84),
    // Southern coastal markets, hotels & colonial galleries
    mk('lm-bazaar-sw', 'Cinnamon Corner Emporium', 'pettah_bazaar', -22, 64, 15, 12, 11, 0, 0xd47634),
    mk('lm-hotel-se', 'Southern Bay Residences', 'hotel_tower', 22, 64, 15, 13, 27, 0, 0x4b7799),
    mk('lm-plaza-ene', 'Maradana Trade House', 'commercial_plaza', 62, -64, 15, 13, 21, 0, 0x8a5b4a),
    mk('lm-arcade-ese', 'Fort Customs Gallery', 'colonial_arcade', 62, 64, 15, 12, 10.5, 0, 0xc45c38),
    mk('lm-temple-s', 'Kollupitiya Kovil Spire', 'temple_pavilion', -22, 84, 12, 12, 14, 0, 0xe85d3f),
  ];
}
