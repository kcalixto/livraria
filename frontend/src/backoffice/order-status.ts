export type OrderStatus =
  | 'waiting-payment'
  | 'payment-received'
  | 'sent-to-delivery'
  | 'received';

export const ORDER_STATUSES: OrderStatus[] = [
  'waiting-payment',
  'payment-received',
  'sent-to-delivery',
  'received',
];

export interface OrderLine {
  id: string;
  book_id: string;
  name: string;
  contact: string;
  amount: number;
  region: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

interface StageInfo {
  index: number;
  label: string;
  next: OrderStatus | null;
  nextLabel: string | null;
}

export const STAGES: Record<OrderStatus, StageInfo> = {
  'waiting-payment': {
    index: 0,
    label: 'Esperando pagamento',
    next: 'payment-received',
    nextLabel: 'Confirmar pagamento',
  },
  'payment-received': {
    index: 1,
    label: 'Pagamento efetuado',
    next: 'sent-to-delivery',
    nextLabel: 'Enviar p/ entrega',
  },
  'sent-to-delivery': {
    index: 2,
    label: 'Enviado para entrega',
    next: 'received',
    nextLabel: 'Marcar entregue',
  },
  received: { index: 3, label: 'Entregue', next: null, nextLabel: null },
};

export interface OrderGroup {
  id: string;
  name: string;
  contact: string;
  region: string;
  created_at: string;
  lines: OrderLine[];
}

export function groupOrders(lines: OrderLine[]): OrderGroup[] {
  const byId = new Map<string, OrderGroup>();
  for (const line of lines) {
    const group = byId.get(line.id);
    if (group) {
      group.lines.push(line);
      if (line.created_at < group.created_at) group.created_at = line.created_at;
    } else {
      byId.set(line.id, {
        id: line.id,
        name: line.name,
        contact: line.contact,
        region: line.region,
        created_at: line.created_at,
        lines: [line],
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function isDelivered(group: OrderGroup): boolean {
  return group.lines.every((l) => l.status === 'received');
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
