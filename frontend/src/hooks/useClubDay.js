import { useEffect, useState } from 'react';
import { civilToday } from '../utils/civil-dates.js';

export function useClubDay() {
  const [today, setToday] = useState(() => civilToday());
  useEffect(() => {
    const update = () => setToday(civilToday());
    // Atualiza apenas o calendário local; não faz requisições nem renova a sessão.
    const timer = setInterval(update, 60_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return today;
}
