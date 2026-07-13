import { useEffect } from 'react';

export interface ToastData {
  kind: 'success' | 'error';
  message: string;
}

const SUCCESS_MS = 4000;
const ERROR_MS = 8000; // erro pede mais tempo de leitura

// popup temporário fixo no canto: visível de qualquer ponto da lista
export function Toast({ toast, onDone }: { toast: ToastData; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.kind === 'error' ? ERROR_MS : SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  const isError = toast.kind === 'error';
  return (
    <div
      className="toast"
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className={`alert alert--${isError ? 'error' : 'success'}`}>
        {toast.message}
      </div>
    </div>
  );
}
