import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../cart/CartContext';
import { Header } from './Header';

function renderHeader() {
  return render(
    <MemoryRouter>
      <CartProvider>
        <Header />
      </CartProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('Header', () => {
  it('não é sticky com carrinho vazio', () => {
    const { container } = renderHeader();
    expect(container.querySelector('.site-header--sticky')).toBeNull();
  });

  it('fica sticky quando o carrinho tem pelo menos 1 item', () => {
    localStorage.setItem(
      'livraria:carrinho',
      JSON.stringify([{ book_id: 'b1', title: 'X', price: 100, amount: 1 }]),
    );
    const { container } = renderHeader();
    expect(container.querySelector('.site-header--sticky')).not.toBeNull();
  });
});
