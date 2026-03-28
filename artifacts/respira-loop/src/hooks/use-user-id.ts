import { useState, useEffect } from 'react';

const STORAGE_KEY = 'respiraloop_user_id';

export function useUserId() {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    setUserId(id);
  }, []);

  return userId;
}
