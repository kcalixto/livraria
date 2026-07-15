import { useEffect } from 'react';
import { ActionGlyph } from './ActionIcon';

// Confirmação de operação DESTRUTIVA (delete definitivo): diferente do
// cancelamento, não há volta — o modal grita antes de deixar acontecer.
export function DangerConfirmModal({
  title,
  description,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button className="modal__close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal__body danger-modal__body">
          <span className="danger-modal__icon" aria-hidden="true">
            <ActionGlyph icon="alert" />
          </span>
          <p className="danger-modal__description">{description}</p>
        </div>
        <div className="modal__footer confirm-modal__footer">
          <button
            className="btn btn--primary confirm-modal__btn confirm-modal__btn--danger"
            disabled={busy}
            onClick={onConfirm}
          >
            <ActionGlyph icon="done" /> Confirmar
          </button>
          <button className="btn btn--secondary confirm-modal__btn" onClick={onClose}>
            <ActionGlyph icon="cancel" /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
