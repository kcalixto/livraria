import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiAuthGet, apiGet } from '../api/client';
import type { Book } from '../lib/types';
import { clearToken } from './auth';
import type { Order } from './order-status';

export interface BookInfo {
  title: string;
  price: number;
}

interface OrdersState {
  loading: boolean;
  error: boolean;
  unauthorized: boolean;
  orders: Order[];
  books: Map<string, BookInfo>;
}

// A API já retorna pedidos agrupados (items[] por unidade). Unidades não
// guardam snapshot de título/preço: junta com o catálogo atual (título
// removido do catálogo aparece com o title_id e valor "—").
export function useOrders() {
  const [state, setState] = useState<OrdersState>({
    loading: true,
    error: false,
    unauthorized: false,
    orders: [],
    books: new Map(),
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const [livros, orders] = await Promise.all([
        apiGet<Book[]>('/livros'),
        apiAuthGet<Order[]>('/backoffice/pedidos'),
      ]);
      setState({
        loading: false,
        error: false,
        unauthorized: false,
        orders,
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
