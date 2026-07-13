import { useEffect, useState } from 'react';

const QUERY = '(max-width: 700px)';

// mesmo breakpoint do CSS mobile do backoffice
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(QUERY).matches ?? false);

  useEffect(() => {
    const mql = window.matchMedia?.(QUERY);
    if (!mql) return;
    const onChange = () => setMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return mobile;
}
