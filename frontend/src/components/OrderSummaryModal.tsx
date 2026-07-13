import { useEffect, useState } from 'react';
import { shortOrderId } from '../backoffice/order-status';
import type { Order } from '../backoffice/order-status';
import type { BookInfo } from '../backoffice/useOrders';
import { formatPrice } from '../lib/format';

interface SummaryLine {
  title: string;
  qty: number;
  total: number; // centavos (Σ received_amount ?? preço)
}

// resumo agrupado por título (itens cancelados fora) — pronto pra WhatsApp/email
function buildSummary(order: Order, books: Map<string, BookInfo>): SummaryLine[] {
  const byTitle = new Map<string, SummaryLine>();
  for (const item of order.items) {
    if (item.status === 'cancelled') continue;
    const book = books.get(item.title_id);
    const title = book?.title ?? item.title_id;
    const value = item.received_amount ?? book?.price ?? 0;
    const line = byTitle.get(title) ?? { title, qty: 0, total: 0 };
    line.qty += 1;
    line.total += value;
    byTitle.set(title, line);
  }
  return [...byTitle.values()];
}

export function OrderSummaryModal({
  order,
  books,
  onClose,
}: {
  order: Order;
  books: Map<string, BookInfo>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const lines = buildSummary(order, books);
  const total = lines.reduce((sum, l) => sum + l.total, 0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function copy() {
    const text = [
      `Pedido ${shortOrderId(order.id)}`,
      ...lines.map((l) => `${l.qty}× ${l.title} — ${formatPrice(l.total)}`),
      `Total: ${formatPrice(total)}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        // só o clique no próprio overlay fecha (não o conteúdo)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Resumo do pedido">
        <div className="modal__header">
          <span className="modal__title">Resumo · {shortOrderId(order.id)}</span>
          <button className="modal__close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal__body">
          {lines.map((l) => (
            <div key={l.title} className="modal__line">
              <span className="modal__line-desc">
                {l.qty}× {l.title}
              </span>
              <span className="modal__line-value">{formatPrice(l.total)}</span>
            </div>
          ))}
          {lines.length === 0 && (
            <div className="modal__empty">Todos os itens deste pedido foram cancelados.</div>
          )}
          <div className="modal__total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--primary btn--block" onClick={() => void copy()}>
            {copied ? 'copiado ✓' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  );
}
