import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoteForm } from './LoteForm';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, social_price: 3000, amount: 0 },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, social_price: 2000, amount: 0 },
  { id: 'b3', title: 'Manual do Agitador Cultural', price: 3400, social_price: 3400, amount: 0 },
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
  it('busca os livros com ?state=all (lote pode repor título arquivado)', async () => {
    renderPage();
    await screen.findByPlaceholderText(/buscar por título/i);

    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/livros?state=all'))).toBe(true);
  });

  it('a lista de títulos só aparece ao focar a busca', async () => {
    renderPage();
    await screen.findByPlaceholderText(/buscar por título/i);

    // fechada antes do foco
    expect(screen.queryByText('A Comuna e o Fogo')).not.toBeInTheDocument();

    await openSearch();
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();
  });

  it('dropdown FECHA após Adicionar (o operador vê o livro entrar na lista)', async () => {
    renderPage();
    await openSearch();

    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-form__available-row')!;
    await userEvent.click(row.querySelector('button')!);

    // some a lista de resultados; fica só o livro adicionado
    expect(document.querySelector('.lote-form__available')).toBeNull();
    expect(screen.queryByText('O Pão e as Rosas')).not.toBeInTheDocument();
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();
  });

  it('apagar a quantidade não remove a linha; sair do campo vazio assume 0', async () => {
    renderPage();
    await openSearch();
    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-form__available-row')!;
    await userEvent.click(row.querySelector('button')!);

    const qty = screen.getByLabelText(/quantidade de a comuna e o fogo/i);
    await userEvent.clear(qty);

    // a linha continua de pé, com o campo vazio pra digitar
    expect(qty).toHaveValue('');
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();

    await userEvent.type(qty, '10');
    expect(qty).toHaveValue('10');

    // limpar e sair do campo: assume 0 (e aí o salvar trava)
    await userEvent.clear(qty);
    await userEvent.tab();
    expect(qty).toHaveValue('0');
  });

  it('Salvar lote fica desabilitado enquanto houver título zerado', async () => {
    renderPage();
    await openSearch();
    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-form__available-row')!;
    await userEvent.click(row.querySelector('button')!);

    const salvar = screen.getByRole('button', { name: /salvar lote/i });
    expect(salvar).toBeEnabled();

    const qty = screen.getByLabelText(/quantidade de a comuna e o fogo/i);
    await userEvent.clear(qty);
    await userEvent.tab();

    expect(salvar).toBeDisabled();
    expect(screen.getByText(/quantidade/i, { selector: '.field-error' })).toBeInTheDocument();
  });

  it('mostra a capa do livro na busca e na lista de selecionados', async () => {
    renderPage();
    await openSearch();
    expect(document.querySelectorAll('.lote-form__available .bo-livros__cover').length).toBe(3);

    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-form__available-row')!;
    await userEvent.click(row.querySelector('button')!);

    expect(
      document.querySelector('.lote-form__selected-row .bo-livros__cover'),
    ).toBeInTheDocument();
  });

  it('observação vai no payload com limite de 200 chars', async () => {
    renderPage();
    await openSearch();
    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-form__available-row')!;
    await userEvent.click(row.querySelector('button')!);

    const obs = screen.getByLabelText(/observação/i);
    expect(obs).toHaveAttribute('maxLength', '200');
    await userEvent.type(obs, 'comprado na feira do livro');
    expect(screen.getByText('26/200')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /salvar lote/i }));
    const postCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST');
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toMatchObject({
      observation: 'comprado na feira do livro',
    });
  });

  it('checkbox "custo social" por linha usa o preço social no total do lote', async () => {
    renderPage();
    await openSearch();
    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-form__available-row')!;
    await userEvent.click(row.querySelector('button')!);

    // preço cheio por padrão
    expect(screen.getByText('R$ 42,00', { selector: '.lote-form__total' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /custo social/i }));
    expect(screen.getByText('R$ 30,00', { selector: '.lote-form__total' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /salvar lote/i }));
    const postCall = fetchMock.mock.calls.find(
      ([, i]) => (i as RequestInit)?.method === 'POST',
    );
    expect(JSON.parse((postCall![1] as RequestInit).body as string).total_cost).toBe(3000);
  });

  it('form sujo bloqueia beforeunload; limpo não bloqueia', async () => {
    renderPage();
    await screen.findByPlaceholderText(/buscar por título/i);

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    const search = await openSearch();
    await userEvent.type(search, 'comuna');
    const row = screen.getByText('A Comuna e o Fogo').closest('.lote-form__available-row')!;
    await userEvent.click(row.querySelector('button')!);

    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
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
