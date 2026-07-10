export const ORDER_STATUSES = [
  'waiting-payment',
  'payment-received',
  'sent-to-delivery',
  'received',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_WAITING_PAYMENT: OrderStatus = 'waiting-payment';

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}
