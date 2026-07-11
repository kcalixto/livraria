import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Estoque } from './Estoque';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 2, status: 'disponível' },
];

const estoque = [
  { book_id: 'b1', acquired: 5, reserved: 1, picked_up: 1, sold: 1, available: 2 },
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

describe('Backoffice — Estoque real', () => {
  it('mostra o saldo real por livro na região', async () => {
    render(
      <MemoryRouter>
        <Estoque />
      </MemoryRouter>,
    );

    expect(await screen.findByText('A Comuna e o Fogo')).toBeInTheDocument();

    const row = screen.getByText('A Comuna e o Fogo').closest('.stock-table__row')!;
    const cells = Array.from(row.querySelectorAll('span')).map((s) => s.textContent);
    // adquirido 5, reservado 1, retirado 1, vendido 1, disponível 2
    expect(cells).toEqual(expect.arrayContaining(['5', '1', '1', '1', '2']));
    // sem banner de mock
    expect(screen.queryByText(/números fictícios/i)).not.toBeInTheDocument();
  });
});
