/**
 * `GeolocationPositionError.message` is whatever the browser's own
 * implementation happens to say ("User denied Geolocation", "Timeout
 * expired", etc.) — technical, occasionally alarming-sounding, and
 * inconsistent across browsers. Map the standard `.code` to plain language
 * instead of showing that string straight to the user.
 */
export function friendlyGeolocationError(error: unknown): string {
  const code = (error as GeolocationPositionError)?.code;
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "Location access was blocked — try searching by city name instead.";
    case 2: // POSITION_UNAVAILABLE
      return "Couldn't determine your location right now — try searching by city name instead.";
    case 3: // TIMEOUT
      return "Location lookup took too long — try searching by city name instead.";
    default:
      return "Couldn't get your location — try searching by city name instead.";
  }
}
