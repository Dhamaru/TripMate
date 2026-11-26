import { useEffect, useState } from "react";

// UX-audit finding: offline was fully undetected anywhere in the app —
// a user offline (e.g. abroad with no data plan, the exact scenario the
// landing page's "offline maps" pitch targets) saw an indefinite
// "Loading..." spinner that eventually bounced to the sign-in page, with
// no explanation. This is the one hook the whole app was missing.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
