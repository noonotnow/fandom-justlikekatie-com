import { useState, useEffect, useCallback } from 'react';
import { getPublicSession } from '../utils/publicAccount';

export interface AdminState {
  isAdmin: boolean;
  /** True until the first session check has resolved — avoids a premature sign-in prompt */
  loading: boolean;
  /**
   * Force a fresh session check — call after any admin API request returns 401
   * so mid-session cookie expiry transitions the view to the sign-in gate.
   */
  recheck: () => void;
}

/**
 * Returns admin status for the current session.
 * Starts loading=true until the server responds, then switches to loading=false.
 * Re-checks whenever:
 *  - `recheck()` is called externally (e.g. after a 401 from a protected API)
 *  - a `session-changed` event arrives (e.g. after consuming a magic link)
 */
export function useIsAdmin(): AdminState {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const recheck = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      const user = await getPublicSession();
      if (cancelled) return;
      setIsAdmin(user?.isAdmin === true);
      setLoading(false);
    };

    void checkSession();

    // Re-check when another tab or this tab fires a session-changed event
    const channel =
      'BroadcastChannel' in window ? new BroadcastChannel('fandom-collection') : null;
    channel?.addEventListener('message', event => {
      if (event.data?.type === 'session-changed') void checkSession();
    });
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === 'fandom-collection-notify' &&
        event.newValue?.startsWith('session-changed:')
      ) {
        void checkSession();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      cancelled = true;
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  // `tick` is the external recheck trigger — re-run the whole effect when it bumps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { isAdmin, loading, recheck };
}
