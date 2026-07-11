export type OrderStatus =
  | 'waiting-payment'
  | 'in-reserve'
  | 'payment-received'
  | 'sent-to-delivery'
  | 'received';

export interface UnitItem {
  unit_id: string;
  title_id: string;
  status: OrderStatus;
  lote_id?: string;
  received_amount?: number;
  picked_up?: boolean;
  updated_at?: string;
}

// Pedido como a API do backoffice retorna: agrupador de entrega + unidades
export interface Order {
  id: string;
  name: string;
  contact: string;
  region: string;
  created_at: string;
  items: UnitItem[];
}

interface StageInfo {
  index: number;
  label: string;
  next: OrderStatus | null;
  nextLabel: string | null;
}

export const STAGE_COUNT = 5;

export const STAGES: Record<OrderStatus, StageInfo> = {
  'waiting-payment': {
    index: 0,
    label: 'Esperando pagamento',
    next: 'in-reserve',
    nextLabel: 'Reservar',
  },
  'in-reserve': {
    index: 1,
    label: 'Em Reserva',
    next: 'payment-received',
    nextLabel: 'Confirmar pagamento',
  },
  'payment-received': {
    index: 2,
    label: 'Pagamento efetuado',
    next: 'sent-to-delivery',
    nextLabel: 'Enviar p/ entrega',
  },
  'sent-to-delivery': {
    index: 3,
    label: 'Enviado para entrega',
    next: 'received',
    nextLabel: 'Marcar entregue',
  },
  received: { index: 4, label: 'Entregue', next: null, nextLabel: null },
};

// unidade finalizada = aparece em Vendas
export function isUnitFinalized(item: UnitItem): boolean {
  return (
    item.status === 'received' ||
    (item.picked_up === true && item.status === 'payment-received')
  );
}

export function isDelivered(order: Order): boolean {
  return order.items.every(isUnitFinalized);
}

export function formatOrderDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} · ${d.getHours()}h`;
}

export function shortOrderId(id: string): string {
  if (/^[A-Z0-9]{6}$/.test(id)) return `#${id.slice(0, 3)}-${id.slice(3)}`;
  return `#${id.slice(0, 8)}`; // pedidos antigos com uuid
}
