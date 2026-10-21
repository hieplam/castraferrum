// The web's clock for the "running for how long" figure ticking every second between two loads (UC-03: self-updating, no F5).
// It is only the browser's now - every count still comes from the API.
import { useEffect, useState } from 'react';

export function useNow(everyMs = 1_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
