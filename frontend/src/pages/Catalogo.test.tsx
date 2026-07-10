import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../cart/CartContext';
import { Catalogo } from './Catalogo';
import type { Book } from '../lib/types';

const books: Book[] = [
  {
    id: 'b1',
    title: 'A Comuna e o Fogo',
    author: 'Aurélio Bandeira',
    description: 'Par 1.',
    price: 4200,
    amount: 12,
    status: 'disponível',
    image_url: 'x',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <CartProvider>
        <Catalogo />
      </CartProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Catalogo', () => {
  it('carrega e lista os livros da API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(books), { status: 200 })),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'A Comuna e o Fogo' })).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há livros', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('[]', { status: 200 })),
    );

    renderPage();

    expect(await screen.findByText(/ainda não há edições disponíveis/i)).toBeInTheDocument();
  });

  it('mostra erro com botão de tentar de novo, que refaz a chamada', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response(JSON.stringify(books), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText(/não foi possível carregar o catálogo/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'A Comuna e o Fogo' })).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mostra o picker de região com a única opção ativa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('[]', { status: 200 })),
    );

    renderPage();

    expect(await screen.findByText('SP, Capital — Zona Sul')).toBeInTheDocument();
  });
});
