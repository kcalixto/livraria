export const ORDER_STATUSES = [
    'waiting-payment',
    'in-reserve',
    'payment-received',
    'sent-to-delivery',
    'received',
    'cancelled',
];
export const ORDER_STATUS_WAITING_PAYMENT = 'waiting-payment';
export function isOrderStatus(value) {
    return typeof value === 'string' && ORDER_STATUSES.includes(value);
}
// finalizada = venda concluída (aparece em Vendas; não pode ser cancelada)
export function isUnitFinalized(unit) {
    return (unit.status === 'received' ||
        (unit.picked_up === true && unit.status === 'payment-received'));
}
