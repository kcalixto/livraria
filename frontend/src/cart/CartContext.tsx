import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { CartItem } from '../lib/types';

const STORAGE_KEY = 'livraria:carrinho';

type Action =
  | { type: 'add'; book: { id: string; title: string; price: number } }
  | { type: 'setAmount'; book_id: string; amount: number }
  | { type: 'remove'; book_id: string }
  | { type: 'clear' };

function reducer(items: CartItem[], action: Action): CartItem[] {
  switch (action.type) {
    case 'add': {
      const existing = items.find((i) => i.book_id === action.book.id);
      if (existing) {
        return items.map((i) =>
          i.book_id === action.book.id ? { ...i, amount: i.amount + 1 } : i,
        );
      }
      return [
        ...items,
        {
          book_id: action.book.id,
          title: action.book.title,
          price: action.book.price,
          amount: 1,
        },
      ];
    }
    case 'setAmount': {
      if (action.amount < 1) return items.filter((i) => i.book_id !== action.book_id);
      return items.map((i) =>
        i.book_id === action.book_id ? { ...i, amount: action.amount } : i,
      );
    }
    case 'remove':
      return items.filter((i) => i.book_id !== action.book_id);
    case 'clear':
      return [];
  }
}

function loadInitial(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

interface CartValue {
  items: CartItem[];
  count: number;
  total: number;
  add: (book: { id: string; title: string; price: number }) => void;
  setAmount: (book_id: string, amount: number) => void;
  remove: (book_id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartValue>(
    () => ({
      items,
      count: items.reduce((sum, i) => sum + i.amount, 0),
      total: items.reduce((sum, i) => sum + i.amount * i.price, 0),
      add: (book) => dispatch({ type: 'add', book }),
      setAmount: (book_id, amount) => dispatch({ type: 'setAmount', book_id, amount }),
      remove: (book_id) => dispatch({ type: 'remove', book_id }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve ser usado dentro de <CartProvider>');
  return ctx;
}
