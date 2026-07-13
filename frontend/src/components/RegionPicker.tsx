import { useEffect, useRef, useState } from 'react';
import { ACTIVE_REGION, SOON_REGIONS } from '../lib/region';

export function RegionPicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="region-picker" ref={ref}>
      <button
        className="region-picker__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="region-picker__label">Região</span>
        <span className="region-picker__value">{ACTIVE_REGION}</span>
        <span className="region-picker__caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="region-picker__menu">
          <div className="region-picker__option region-picker__option--active">
            <span>{ACTIVE_REGION}</span>
            <span className="region-picker__check">✓</span>
          </div>
          {SOON_REGIONS.map((r) => (
            <div key={r} className="region-picker__option region-picker__option--soon">
              <span>{r}</span>
              <span className="region-picker__soon-tag">em breve</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
