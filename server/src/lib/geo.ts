// Distance for Discover. Pure, safe anywhere.
//
// Privacy: a phone's location is rounded to 2 decimals (about 1 km) before it's
// saved, it's never sent to anyone else, and other people only ever see a
// rough band ("Less than 5 km away"), so nobody can work out where someone lives.

export interface Point { lat: number; lng: number }

/** Choices for "how far away" in the profile. 0 means anywhere. */
export const DISTANCES = [5, 10, 25, 50, 100, 0] as const;
export const DEFAULT_MAX_KM = 50;

export function roundPoint(p: Point): Point {
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

export function cleanPoint(lat: unknown, lng: unknown): Point | null {
  const a = Number(lat);
  const b = Number(lng);
  if (lat === null || lat === undefined || lat === "" || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180 || (a === 0 && b === 0)) return null;
  return roundPoint({ lat: a, lng: b });
}

export function cleanMaxKm(v: unknown): number {
  const n = Math.round(Number(v));
  return (DISTANCES as readonly number[]).includes(n) ? n : DEFAULT_MAX_KM;
}

export function km(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const BANDS = [2, 5, 10, 15, 25, 50, 75, 100, 150, 250, 500];

/** What other people see: never the exact distance. */
export function distanceLabel(d: number | null): string | null {
  if (d === null) return null;
  if (d < 2) return "Less than 2 km away";
  const band = BANDS.find((b) => d <= b);
  return band ? `Less than ${band} km away` : "More than 500 km away";
}

/** For people who'd rather pick a city than share their phone's location. */
export const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "Durban", lat: -29.86, lng: 31.03 }, { name: "Umhlanga", lat: -29.73, lng: 31.08 }, { name: "Pietermaritzburg", lat: -29.6, lng: 30.38 },
  { name: "Johannesburg", lat: -26.2, lng: 28.05 }, { name: "Pretoria", lat: -25.75, lng: 28.19 }, { name: "Sandton", lat: -26.11, lng: 28.05 },
  { name: "Soweto", lat: -26.27, lng: 27.86 }, { name: "Cape Town", lat: -33.92, lng: 18.42 }, { name: "Stellenbosch", lat: -33.93, lng: 18.86 },
  { name: "Gqeberha", lat: -33.96, lng: 25.6 }, { name: "East London", lat: -33.02, lng: 27.91 }, { name: "Bloemfontein", lat: -29.09, lng: 26.16 },
  { name: "Polokwane", lat: -23.9, lng: 29.45 }, { name: "Mbombela", lat: -25.47, lng: 30.97 }, { name: "Rustenburg", lat: -25.67, lng: 27.24 },
  { name: "Kimberley", lat: -28.74, lng: 24.77 }, { name: "George", lat: -33.96, lng: 22.46 }, { name: "Richards Bay", lat: -28.78, lng: 32.04 },
  { name: "Gaborone", lat: -24.65, lng: 25.91 }, { name: "Windhoek", lat: -22.56, lng: 17.08 }, { name: "Maputo", lat: -25.97, lng: 32.57 },
  { name: "Harare", lat: -17.83, lng: 31.05 }, { name: "Nairobi", lat: -1.29, lng: 36.82 }, { name: "Lagos", lat: 6.52, lng: 3.38 },
  { name: "Accra", lat: 5.6, lng: -0.19 }, { name: "London", lat: 51.51, lng: -0.13 }, { name: "Manchester", lat: 53.48, lng: -2.24 },
  { name: "Dubai", lat: 25.2, lng: 55.27 }, { name: "New York", lat: 40.71, lng: -74.01 }, { name: "Toronto", lat: 43.65, lng: -79.38 },
  { name: "Sydney", lat: -33.87, lng: 151.21 }, { name: "Melbourne", lat: -37.81, lng: 144.96 },
];
