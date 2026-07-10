import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiAuthGet, apiGet } from '../api/client';
import type { Book } from '../lib/types';
import { clearToken } from './auth';
import { groupOrders, ORDER_STATUSES } from './order-status';
import type { OrderGroup, OrderLine } from './order-status';

export interface BookInfo {
  title: string;
  price: number;
}

interface OrdersState {
  loading: boolean;
  error: boolean;
  unauthorized: boolean;
  groups: OrderGroup[];
  books: Map<string, BookInfo>;
}

// Pedidos não guardam snapshot de título/preço: junta com o catálogo atual.
// Livro removido do catálogo aparece com o book_id e valor "—".
export function useOrders() {
  const [state, setState] = useState<OrdersState>({
    loading: true,
    error: false,
    unauthorized: false,
    groups: [],
    books: new Map(),
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const [livros, ...byStatus] = await Promise.all([
        apiGet<Book[]>('/livros'),
        ...ORDER_STATUSES.map((status) =>
          apiAuthGet<OrderLine[]>(`/backoffice/pedidos?status=${status}`),
        ),
      ]);
      setState({
        loading: false,
        error: false,
        unauthorized: false,
        groups: groupOrders(byStatus.flat()),
        books: new Map(livros.map((b) => [b.id, { title: b.title, price: b.price }])),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setState((s) => ({ ...s, loading: false, unauthorized: true }));
        return;
      }
      setState((s) => ({ ...s, loading: false, error: true }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
