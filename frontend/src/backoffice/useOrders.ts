import { useCallback } from 'react';
import { apiAuthGet, apiGet } from '../api/client';
import type { Book } from '../lib/types';
import type { Order } from './order-status';
import { useBackofficeResource } from './useBackofficeResource';

export interface BookInfo {
  title: string;
  price: number;
  social_price?: number;
  amount: number; // estoque disponível na região
}

interface OrdersData {
  orders: Order[];
  books: Map<string, BookInfo>;
}

// A API já retorna pedidos agrupados (items[] por unidade). Unidades não
// guardam snapshot de título/preço: junta com o catálogo atual (título
// removido do catálogo aparece com o title_id e valor "—").
export function useOrders() {
  const fetcher = useCallback(async (): Promise<OrdersData> => {
    const [livros, orders] = await Promise.all([
      apiGet<Book[]>('/livros'),
      apiAuthGet<Order[]>('/backoffice/pedidos'),
    ]);
    return {
      orders,
      books: new Map(
        livros.map((b) => [
          b.id,
          { title: b.title, price: b.price, social_price: b.social_price, amount: b.amount },
        ]),
      ),
    };
  }, []);

  const { data, loading, refreshing, error, unauthorized, reload } =
    useBackofficeResource<OrdersData>(fetcher);

  return {
    orders: data?.orders ?? [],
    books: data?.books ?? new Map<string, BookInfo>(),
    loading,
    refreshing,
    error,
    unauthorized,
    reload,
  };
}
