import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Estoque } from './Estoque';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 2, status: 'disponível' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, amount: 1, status: 'disponível' },
];

const estoque = [
  { book_id: 'b1', acquired: 5, reserved: 1, picked_up: 1, sold: 1, available: 2 },
  { book_id: 'b2', acquired: 2, reserved: 0, picked_up: 0, sold: 1, available: 1 },
];

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/backoffice/estoque')) {
        return Promise.resolve(new Response(JSON.stringify(estoque), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Estoque />
    </MemoryRouter>,
  );
}

describe('Backoffice — Estoque real', () => {
  it('mostra o saldo por livro SEM a coluna Adquirido e com a capa em miniatura', async () => {
    renderPage();

    expect(await screen.findByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.queryByText('Adquirido')).not.toBeInTheDocument();

    const row = screen.getByText('A Comuna e o Fogo').closest('.stock-table__row')!;
    expect(row.querySelector('.bo-livros__cover')).toBeInTheDocument();
    const cells = Array.from(row.querySelectorAll('span:not(.bo-livros__cover)')).map(
      (s) => s.textContent,
    );
    // reservado 1, retirado 1, vendido 1, disponível 2 (sem o adquirido 5)
    expect(cells).toEqual(expect.arrayContaining(['1', '1', '1', '2']));
    expect(cells).not.toContain('5');
  });

  it('mostra contador de baixos quando não há zerados', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    // fixture: b1 available 2 e b2 available 1 — dois baixos, nenhum zerado
    expect(screen.getByText(/2 baixos/i)).toBeInTheDocument();
    expect(screen.queryByText(/zerado/i)).not.toBeInTheDocument();
  });

  it('título zerado sobe pro topo com link de registrar lote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/backoffice/estoque')) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                { book_id: 'b1', acquired: 5, reserved: 0, picked_up: 0, sold: 1, available: 4 },
                { book_id: 'b2', acquired: 2, reserved: 0, picked_up: 0, sold: 2, available: 0 },
              ]),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
      }),
    );
    renderPage();

    await screen.findByText('O Pão e as Rosas');
    const rowTitles = Array.from(document.querySelectorAll('.stock-table__title')).map(
      (t) => t.textContent,
    );
    expect(rowTitles[0]).toBe('O Pão e as Rosas'); // zerado primeiro
    expect(screen.getByText(/1 zerado/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /registrar lote/i })).toHaveAttribute(
      'href',
      '/backoffice/lotes/novo',
    );
  });

  it('busca por título filtra com debounce', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    await userEvent.type(screen.getByPlaceholderText(/buscar por título/i), 'pão');

    // ainda não filtrou (debounce)
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();

    await waitFor(
      () => expect(screen.queryByText('A Comuna e o Fogo')).not.toBeInTheDocument(),
      { timeout: 1000 },
    );
    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
  });
});
