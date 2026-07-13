import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Lotes } from './Lotes';

const lotes = [
  {
    id: 'lote-a',
    date: '2026-07-01',
    region: 'SP, Capital - Zona Sul',
    books: [{ book_id: 'b1', amount: 2 }],
    total_cost: 8000,
    total_books: 2,
    total_remaining: 1,
    sold_value: 10000,
  },
  {
    id: 'lote-b',
    date: '2026-06-01',
    region: 'SP, Capital - Zona Sul',
    books: [{ book_id: 'b1', amount: 3 }],
    total_cost: 5000,
    total_books: 3,
    total_remaining: 0,
    sold_value: 12000,
  },
];

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(lotes), { status: 200 })),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderPage(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/backoffice/lotes', state }]}>
      <Routes>
        <Route path="/backoffice/lotes" element={<Lotes />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Backoffice — Lotes', () => {
  it('lista lotes com data, gasto e vendido formatados', async () => {
    renderPage();

    expect(await screen.findByText('01/07/2026')).toBeInTheDocument();
    expect(screen.getByText('R$ 80,00')).toBeInTheDocument(); // gasto
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument(); // vendido (doações)
    expect(screen.getByText('2')).toBeInTheDocument(); // nº livros
  });

  it('linha aponta para o detalhe do lote e existe link de novo lote', async () => {
    renderPage();

    const detalhe = await screen.findByRole('link', { name: /01\/07\/2026/ });
    expect(detalhe).toHaveAttribute('href', '/backoffice/lotes/lote-a');
    expect(screen.getByRole('link', { name: /novo lote/i })).toHaveAttribute(
      'href',
      '/backoffice/lotes/novo',
    );
  });

  it('mostra coluna Restante e badge Esgotado quando zera', async () => {
    renderPage();
    await screen.findByText('01/07/2026');

    expect(screen.getByText('Restante')).toBeInTheDocument();
    // lote-a restante 1; lote-b restante 0 vira badge
    const rows = document.querySelectorAll('.lotes-table__row');
    expect(rows[0].querySelector('.lotes-table__remaining')!.textContent).toBe('1');
    expect(rows[1].textContent).toMatch(/esgotado/i);
  });

  it('mostra toast de sucesso vindo do form (navigation state)', async () => {
    renderPage({ toast: 'Lote registrado' });
    await screen.findByText('01/07/2026');
    expect(screen.getByText(/lote registrado/i)).toBeInTheDocument();
  });
});
