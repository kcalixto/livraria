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
  social_price?: boolean; // venda feita com preço social
  picked_up?: boolean;
  paid_at?: string;
  observation?: string; // escrita pelo operador; visível na consulta pública
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
  exceptional?: boolean; // fora do fluxo sequencial (como picked_up)
}

// Fluxo NORMAL tem 4 estágios; "Em Reserva" é estado excepcional que ocupa a
// mesma posição de waiting (deduz estoque, mas não avança o fluxo).
export const STAGE_COUNT = 4;

export const STAGES: Record<OrderStatus, StageInfo> = {
  'waiting-payment': { index: 0, label: 'Esperando pagamento' },
  'in-reserve': { index: 0, label: 'Em Reserva', exceptional: true },
  'payment-received': { index: 1, label: 'Pagamento efetuado' },
  'sent-to-delivery': { index: 2, label: 'Enviado para entrega' },
  received: { index: 3, label: 'Entregue' },
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
  // ano só quando difere do corrente: Pedidos fica limpo, Vendas históricas sem ambiguidade
  const yy =
    d.getFullYear() === new Date().getFullYear()
      ? ''
      : `/${String(d.getFullYear()).slice(2)}`;
  return `${dd}/${mm}${yy} · ${d.getHours()}h`;
}

export function shortOrderId(id: string): string {
  if (/^[A-Z0-9]{6}$/.test(id)) return `#${id.slice(0, 3)}-${id.slice(3)}`;
  return `#${id.slice(0, 8)}`; // pedidos antigos com uuid
}
