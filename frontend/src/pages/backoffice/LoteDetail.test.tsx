import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoteDetail } from './LoteDetail';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 0, status: 'disponível' },
];

const detalhe = {
  id: 'lote-a',
  date: '2026-07-01',
  region: 'SP, Capital - Zona Sul',
  total_cost: 8000,
  sold_value: 10000,
  books: [
    { book_id: 'b1', acquired: 2, reserved: 1, picked_up: 0, sold: 1, remaining: 0 },
  ],
};

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/backoffice/lotes/')) {
        return Promise.resolve(new Response(JSON.stringify(detalhe), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('Backoffice — Detalhe do lote', () => {
  it('mostra totais gasto × vendido e a tabela por livro com restante', async () => {
    render(
      <MemoryRouter initialEntries={['/backoffice/lotes/lote-a']}>
        <Routes>
          <Route path="/backoffice/lotes/:id" element={<LoteDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.getByText('R$ 80,00')).toBeInTheDocument(); // gasto
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument(); // vendido

    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-detail__row')!;
    const cells = Array.from(row.querySelectorAll('span')).map((s) => s.textContent);
    // adquirido 2, reservado 1, retirado 0, vendido 1, restante 0
    expect(cells).toEqual(expect.arrayContaining(['2', '1', '0', '1', '0']));
  });
});
