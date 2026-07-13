export const ORDER_STATUSES = [
  'waiting-payment',
  'in-reserve',
  'payment-received',
  'sent-to-delivery',
  'received',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_WAITING_PAYMENT: OrderStatus = 'waiting-payment';

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

// finalizada = venda concluída (aparece em Vendas; não pode ser cancelada)
export function isUnitFinalized(unit: Record<string, unknown>): boolean {
  return (
    unit.status === 'received' ||
    (unit.picked_up === true && unit.status === 'payment-received')
  );
}
