import { http, HttpResponse } from 'msw'

export const handlers = [

  // ─── Open-Meteo (weather) ───────────────────────────────────────────
  http.get('https://api.open-meteo.com/v1/forecast', () => {
    return HttpResponse.json({
      current: {
        temperature_2m: 25.5,
        relative_humidity_2m: 60,
        weather_code: 0,
        wind_speed_10m: 10,
      },
      daily: {
        time: ['2025-06-01', '2025-06-02', '2025-06-03'],
        temperature_2m_max: [28, 30, 27],
        temperature_2m_min: [20, 21, 19],
        weather_code: [0, 61, 0],
        precipitation_probability_max: [0, 20, 0],
      },
      timezone: 'Asia/Tokyo',
    })
  }),

  // ─── wttr.in (weather fallback) ──────────────────────────────────────
  http.get('https://wttr.in/:city', () => {
    return HttpResponse.json({
      current_condition: [{ temp_C: '25', weatherDesc: [{ value: 'Partly cloudy' }] }],
    })
  }),

  // ─── Nominatim (geocoding) ───────────────────────────────────────────
  http.get('https://nominatim.openstreetmap.org/search', () => {
    return HttpResponse.json([{
      lat: '35.6762',
      lon: '139.6503',
      display_name: 'Tokyo, Japan',
      address: { country: 'Japan', country_code: 'jp' },
    }])
  }),

  // ─── Overpass API (POIs) ─────────────────────────────────────────────
  http.post('https://overpass-api.de/api/interpreter', () => {
    return HttpResponse.json({
      elements: [
        { id: 1, type: 'node', lat: 35.6595, lon: 139.7004,
          tags: { name: 'Senso-ji Temple', tourism: 'attraction' } },
        { id: 2, type: 'node', lat: 35.6586, lon: 139.7454,
          tags: { name: 'Shibuya Crossing', tourism: 'attraction' } },
        { id: 3, type: 'node', lat: 35.6897, lon: 139.6922,
          tags: { name: 'Shinjuku Gyoen', tourism: 'attraction' } },
      ],
    })
  }),

  // ─── OpenTripMap (curated places) ────────────────────────────────────
  http.get('https://api.opentripmap.com/0.1/en/places/radius', () => {
    return HttpResponse.json([
      { xid: 'W123', name: 'Tokyo Tower', rate: 3,
        point: { lat: 35.6586, lon: 139.7454 } },
      { xid: 'W124', name: 'Meiji Shrine', rate: 3,
        point: { lat: 35.6764, lon: 139.6993 } },
    ])
  }),

  // ─── Frankfurter (currency) ──────────────────────────────────────────
  http.get('https://api.frankfurter.app/latest', () => {
    return HttpResponse.json({
      base: 'USD',
      date: '2025-06-01',
      rates: { EUR: 0.92, GBP: 0.79, JPY: 149.5, INR: 83.2 },
    })
  }),

  // ─── OSRM (routing) ──────────────────────────────────────────────────
  http.get('http://router.project-osrm.org/route/v1/:mode/:coords', () => {
    return HttpResponse.json({
      code: 'Ok',
      routes: [{
        distance: 5200,
        duration: 1320,
        geometry: 'mocked_encoded_polyline_string',
        legs: [{ distance: 5200, duration: 1320, steps: [] }],
      }],
    })
  }),

  // ─── REST Countries (emergency info) ─────────────────────────────────
  http.get('https://restcountries.com/v3.1/name/:country', () => {
    return HttpResponse.json([{
      name: { common: 'Japan' },
      idd: { root: '+8', suffixes: ['1'] },
      flags: { svg: 'https://flagcdn.com/jp.svg' },
    }])
  }),

  // ─── Unsplash Source (hero images) ───────────────────────────────────
  http.get('https://source.unsplash.com/:dims', () => {
    return HttpResponse.redirect(
      'https://images.unsplash.com/photo-test-tokyo-123?w=800',
      301
    )
  }),

  // ─── MyMemory Translation ─────────────────────────────────────────────
  http.get('https://api.mymemory.translated.net/get', () => {
    return HttpResponse.json({
      responseData: { translatedText: '駅はどこですか', match: 1 },
      responseStatus: 200,
    })
  }),
]
