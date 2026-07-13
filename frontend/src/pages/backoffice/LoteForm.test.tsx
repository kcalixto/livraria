import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoteForm } from './LoteForm';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 0, status: 'disponível' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, amount: 0, status: 'disponível' },
  { id: 'b3', title: 'Manual do Agitador Cultural', price: 3400, amount: 0, status: 'disponível' },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ id: 'novo-lote' }), { status: 201 }));
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/lotes/novo']}>
      <Routes>
        <Route path="/backoffice/lotes" element={<div>LISTA LOTES</div>} />
        <Route path="/backoffice/lotes/novo" element={<LoteForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openSearch() {
  const search = await screen.findByPlaceholderText(/buscar por título/i);
  await userEvent.click(search);
  return search;
}

describe('Backoffice — Novo lote', () => {
  it('a lista de títulos só aparece ao focar a busca', async () => {
    renderPage();
    await screen.findByPlaceholderText(/buscar por título/i);

    // fechada antes do foco
    expect(screen.queryByText('A Comuna e o Fogo')).not.toBeInTheDocument();

    await openSearch();
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();
  });

  it('busca por título filtra os livros disponíveis', async () => {
    renderPage();
    const search = await openSearch();
    await userEvent.type(search, 'pão');

    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
    expect(screen.queryByText('A Comuna e o Fogo')).not.toBeInTheDocument();
  });

  it('total é CALCULADO (Σ preço × quantidade) e enviado como total_cost', async () => {
    renderPage();
    await openSearch();
    await userEvent.click(screen.getAllByRole('button', { name: /adicionar/i })[0]);

    // stepper: sobe pra 2 unidades de A Comuna e o Fogo (42,00)
    await userEvent.click(screen.getByRole('button', { name: /mais uma unidade/i }));

    // total exibido = 2 × 42,00
    expect(screen.getByText('R$ 84,00', { selector: '.lote-form__total' })).toBeInTheDocument();
    // não existe input manual de valor
    expect(screen.queryByLabelText(/valor total/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /salvar lote/i }));

    expect(await screen.findByText('LISTA LOTES')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST');
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      region: 'SP, Capital - Zona Sul',
      books: [{ book_id: 'b1', amount: 2 }],
      total_cost: 8400,
    });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('stepper de menos remove a unidade e zera a linha quando chega a 0', async () => {
    renderPage();
    await openSearch();
    await userEvent.click(screen.getAllByRole('button', { name: /adicionar/i })[0]);

    await userEvent.click(screen.getByRole('button', { name: /menos uma unidade/i }));
    // quantidade 0 remove a linha selecionada
    expect(screen.queryByLabelText(/quantidade de a comuna e o fogo/i)).not.toBeInTheDocument();
  });

  it('valida: sem livros não envia', async () => {
    renderPage();
    await screen.findByPlaceholderText(/buscar por título/i);

    await userEvent.click(screen.getByRole('button', { name: /salvar lote/i }));

    expect(screen.getByText(/adicione pelo menos um livro/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'POST'),
    ).toHaveLength(0);
  });
});
