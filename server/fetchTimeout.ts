// Default timeout for every outbound fetch that doesn't set its own signal.
// Node's fetch otherwise waits ~5 minutes on a hung upstream (about 40 call
// sites had no timeout: geocoders, exchange rates, weather, email, Places),
// holding a request, or the shared Nominatim queue, open the whole time.
// Calls that pass their own AbortSignal keep it.
const DEFAULT_TIMEOUT_MS = 60_000;
const nativeFetch = globalThis.fetch;

globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
  nativeFetch(
    input,
    init?.signal ? init : { ...init, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) },
  )) as typeof fetch;
