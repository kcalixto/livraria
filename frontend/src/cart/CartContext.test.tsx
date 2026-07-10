import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from './CartContext';

const book = { id: 'b1', title: 'A Comuna e o Fogo', price: 4200 };
const book2 = { id: 'b2', title: 'O Pão e as Rosas', price: 3800 };

function wrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}

beforeEach(() => {
  localStorage.clear();
});

describe('CartContext', () => {
  it('começa vazio', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it('adiciona livros e acumula quantidade do mesmo livro', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(book));
    act(() => result.current.add(book));
    act(() => result.current.add(book2));

    expect(result.current.count).toBe(3);
    expect(result.current.items).toEqual([
      { book_id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 2 },
      { book_id: 'b2', title: 'O Pão e as Rosas', price: 3800, amount: 1 },
    ]);
    expect(result.current.total).toBe(4200 * 2 + 3800);
  });

  it('altera quantidade e remove quando chega a zero', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(book));
    act(() => result.current.setAmount('b1', 5));
    expect(result.current.items[0].amount).toBe(5);

    act(() => result.current.setAmount('b1', 0));
    expect(result.current.items).toEqual([]);
  });

  it('remove item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(book));
    act(() => result.current.add(book2));
    act(() => result.current.remove('b1'));
    expect(result.current.items.map((i) => i.book_id)).toEqual(['b2']);
  });

  it('limpa o carrinho', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(book));
    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
  });

  it('persiste em localStorage e restaura', () => {
    const first = renderHook(() => useCart(), { wrapper });
    act(() => first.result.current.add(book));
    first.unmount();

    const second = renderHook(() => useCart(), { wrapper });
    expect(second.result.current.items).toEqual([
      { book_id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 1 },
    ]);
  });
});
