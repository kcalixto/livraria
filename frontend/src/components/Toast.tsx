import { useEffect } from 'react';

export interface ToastData {
  kind: 'success' | 'error';
  message: string;
}

const TOAST_MS = 4000;

// popup temporário fixo no canto: visível de qualquer ponto da lista
export function Toast({ toast, onDone }: { toast: ToastData; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  return (
    <div className="toast">
      <div className={`alert alert--${toast.kind === 'success' ? 'success' : 'error'}`}>
        {toast.message}
      </div>
    </div>
  );
}
