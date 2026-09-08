const EARTH_RADIUS_METERS = 6371000;

export function distanceMeters(latitude1: number, longitude1: number, latitude2: number, longitude2: number) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(latitude2 - latitude1);
  const dLon = toRadians(longitude2 - longitude1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadius(latitude: number, longitude: number, centerLatitude: number, centerLongitude: number, radiusMeters: number) {
  return distanceMeters(latitude, longitude, centerLatitude, centerLongitude) <= radiusMeters;
}
