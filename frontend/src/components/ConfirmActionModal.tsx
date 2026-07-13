import { useEffect } from 'react';
import { ActionGlyph } from './ActionIcon';

// Confirmação de ação no mobile: sem hover não há tooltip, então o modal
// descreve o que vai acontecer antes de executar. Botões com ícone + texto
// por extenso (decisão de UI do dono).
export function ConfirmActionModal({
  label,
  description,
  danger,
  onConfirm,
  onClose,
}: {
  label: string;
  description: string;
  danger?: boolean;
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
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <div className="modal__header">
          <span className="modal__title">{label}</span>
          <button className="modal__close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal__body">
          <p className="confirm-modal__description">{description}</p>
        </div>
        <div className="modal__footer confirm-modal__footer">
          <button
            className={`btn confirm-modal__btn ${danger ? 'btn--primary confirm-modal__btn--danger' : 'btn--primary'}`}
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
