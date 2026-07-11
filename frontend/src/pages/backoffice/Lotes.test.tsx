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
    sold_value: 10000,
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/lotes']}>
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
});
