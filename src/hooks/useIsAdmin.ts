import { useState, useEffect } from 'react';
import { getPublicSession } from '../utils/publicAccount';

/**
 * Returns true only when the current session belongs to an admin account
 * (i.e. the server confirmed isAdmin: true via FANDOM_ADMIN_EMAILS).
 * Starts false until the session check resolves — never reads URL params.
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    void getPublicSession().then(user => {
      setIsAdmin(user?.isAdmin === true);
    });
  }, []);
  return isAdmin;
}
