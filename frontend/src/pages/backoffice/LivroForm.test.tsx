import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LivroForm } from './LivroForm';

const existingBook = {
  id: 'b1',
  slug: 'a-comuna-e-o-fogo',
  title: 'A Comuna e o Fogo',
  author: 'Aurélio Bandeira',
  price: 4200,
  social_price: 3000,
  pages: 288,
  edition: '2ª edição',
  year: 2023,
  format: 'Ensaio',
  description: 'Par 1.\n\nPar 2.',
  amount: 3,
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch({ orders = [], deleteStatus = 204 }: { orders?: unknown[]; deleteStatus?: number } = {}) {
  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST' && u.includes('/backoffice/livros')) {
      return Promise.resolve(
        new Response(JSON.stringify({ ...existingBook, id: 'novo-id' }), { status: 201 }),
      );
    }
    if (init?.method === 'PUT') {
      return Promise.resolve(new Response(JSON.stringify(existingBook), { status: 200 }));
    }
    if (init?.method === 'DELETE') {
      return Promise.resolve(
        deleteStatus === 204
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ error: 'title has orders' }), { status: deleteStatus }),
      );
    }
    if (u.includes('/backoffice/pedidos')) {
      return Promise.resolve(new Response(JSON.stringify(orders), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify([existingBook]), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderForm(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/backoffice/livros" element={<div>LISTA LIVROS</div>} />
        <Route path="/backoffice/livros/novo" element={<LivroForm />} />
        <Route path="/backoffice/livros/:id/editar" element={<LivroForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('LivroForm — criar', () => {
  it('valida campos obrigatórios (título e preço) sem chamar a API', async () => {
    renderForm('/backoffice/livros/novo');

    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(screen.getByText(/informe o título/i)).toBeInTheDocument();
    expect(screen.getByText(/informe um preço válido/i)).toBeInTheDocument();
    expect(screen.getByText(/informe um preço social válido/i)).toBeInTheDocument();
    expect(screen.queryByText(/informe a descrição/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'POST')).toHaveLength(0);
  });

  it('cria livro sem descrição (campo opcional)', async () => {
    renderForm('/backoffice/livros/novo');

    await userEvent.type(screen.getByLabelText(/título/i), 'Sem Descrição');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '10,00');
    await userEvent.type(screen.getByLabelText('Preço social (R$)'), '8,00');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('LISTA LIVROS')).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(
      ([u, i]) => (i as RequestInit)?.method === 'POST' && String(u).endsWith('/backoffice/livros'),
    );
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({ title: 'Sem Descrição', price: 1000, social_price: 800 });
    expect(body).not.toHaveProperty('description');
  });

  it('cria livro convertendo preço de reais para centavos e volta pra lista', async () => {
    renderForm('/backoffice/livros/novo');

    await userEvent.type(screen.getByLabelText(/título/i), 'Livro Novo');
    await userEvent.type(screen.getByLabelText(/autor/i), 'Autora Nova');
    await userEvent.type(screen.getByLabelText(/descrição/i), 'Par A.\n\nPar B.');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '49,90');
    await userEvent.type(screen.getByLabelText('Preço social (R$)'), '35,00');
    await userEvent.type(screen.getByLabelText(/páginas/i), '200');
    await userEvent.type(screen.getByLabelText(/ano/i), '2026');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('LISTA LIVROS')).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(
      ([u, i]) => (i as RequestInit)?.method === 'POST' && String(u).endsWith('/backoffice/livros'),
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      title: 'Livro Novo',
      author: 'Autora Nova',
      price: 4990,
      social_price: 3500,
      pages: 200,
      year: 2026,
    });
    const headers = (postCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer jwt-abc');
  });

  it('form sujo bloqueia beforeunload; limpo e pós-salvar não bloqueiam', async () => {
    renderForm('/backoffice/livros/novo');

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await userEvent.type(screen.getByLabelText(/título/i), 'Rascunho');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    await userEvent.type(screen.getByLabelText('Preço (R$)'), '10,00');
    await userEvent.type(screen.getByLabelText('Preço social (R$)'), '10,00');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await screen.findByText('LISTA LIVROS');

    const afterSave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterSave);
    expect(afterSave.defaultPrevented).toBe(false);
  });

  it('ao criar não há select de estado (livro nasce ativo no backend)', () => {
    renderForm('/backoffice/livros/novo');

    expect(screen.queryByLabelText(/estado/i)).not.toBeInTheDocument();
  });

  it('não tem campo de upload de capa e mostra o lembrete de build', () => {
    renderForm('/backoffice/livros/novo');

    expect(screen.queryByLabelText(/capa/i)).not.toBeInTheDocument();
    // ao criar, o nome do arquivo ainda não existe (o slug nasce no backend)
    expect(
      screen.getByText(/gerado a partir do título e aparece aqui depois de salvar/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/build\/deploy do site/i)).toBeInTheDocument();
  });
});

describe('LivroForm — editar', () => {
  it('ao editar, o aviso mostra o nome real do arquivo da capa (o slug)', async () => {
    renderForm('/backoffice/livros/b1/editar');

    expect(await screen.findByText('a-comuna-e-o-fogo')).toBeInTheDocument();
    expect(screen.getByText(/mudar o título muda esse nome/i)).toBeInTheDocument();
  });

  it('carrega os dados do livro e envia PUT com os campos alterados', async () => {
    renderForm('/backoffice/livros/b1/editar');

    const titulo = await screen.findByLabelText(/título/i);
    expect(titulo).toHaveValue('A Comuna e o Fogo');
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('42,00');

    await userEvent.clear(titulo);
    await userEvent.type(titulo, 'Título Editado');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('LISTA LIVROS')).toBeInTheDocument();

    const putCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(String(putCall![0])).toMatch(/\/backoffice\/livros\/b1$/);
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.title).toBe('Título Editado');
    expect(body.price).toBe(4200);
  });
  it('edita: carrega o preço social e o envia no PUT', async () => {
    renderForm('/backoffice/livros/b1/editar');

    const social = await screen.findByLabelText('Preço social (R$)');
    expect(social).toHaveValue('30,00');

    await userEvent.clear(social);
    await userEvent.type(social, '25,00');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await screen.findByText('LISTA LIVROS');

    const putCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PUT');
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.social_price).toBe(2500);
  });

  it('carrega o livro via /livros?state=all (arquivado precisa abrir pra ser reativado)', async () => {
    renderForm('/backoffice/livros/b1/editar');

    await screen.findByLabelText(/título/i);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/livros?state=all'))).toBe(true);
  });

  it('mostra o select de estado com Ativo por default (livro legado sem state)', async () => {
    renderForm('/backoffice/livros/b1/editar');

    expect(await screen.findByLabelText(/estado/i)).toHaveValue('active');
  });

  it('arquivar: seleciona Arquivado e o PUT envia state archived', async () => {
    renderForm('/backoffice/livros/b1/editar');

    const select = await screen.findByLabelText(/estado/i);
    await userEvent.selectOptions(select, 'archived');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await screen.findByText('LISTA LIVROS');

    const putCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PUT');
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.state).toBe('archived');
  });

  it('livro arquivado carrega Arquivado selecionado e reativar envia state active', async () => {
    const arquivado = { ...existingBook, state: 'archived' };
    fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(new Response(JSON.stringify(arquivado), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([arquivado]), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderForm('/backoffice/livros/b1/editar');

    const select = await screen.findByLabelText(/estado/i);
    expect(select).toHaveValue('archived');

    await userEvent.selectOptions(select, 'active');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await screen.findByText('LISTA LIVROS');

    const putCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PUT');
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.state).toBe('active');
  });

  it('livro antigo sem preço social pré-preenche com o preço cheio', async () => {
    const legado = { ...existingBook, social_price: undefined };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify([legado]), { status: 200 })),
      ),
    );
    renderForm('/backoffice/livros/b1/editar');

    expect(await screen.findByLabelText('Preço social (R$)')).toHaveValue('42,00');
  });
});

describe('LivroForm — deletar', () => {
  const saleOfB1 = {
    id: 'PED001',
    items: [{ unit_id: 'u1', title_id: 'b1', status: 'cancelled' }],
  };

  it('sem venda: Deletar livro abre o modal e confirmar envia DELETE e navega com toast', async () => {
    renderForm('/backoffice/livros/b1/editar');

    const btn = await screen.findByRole('button', { name: /deletar livro/i });
    await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));

    await userEvent.click(btn);
    expect(screen.getByRole('dialog', { name: /deletar livro/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(await screen.findByText('LISTA LIVROS')).toBeInTheDocument();

    const del = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'DELETE');
    expect(String(del![0])).toMatch(/\/backoffice\/livros\/b1$/);
  });

  it('com venda (até cancelada): botão desabilitado com tooltip e clique não abre modal', async () => {
    stubFetch({ orders: [saleOfB1] });
    renderForm('/backoffice/livros/b1/editar');

    const btn = await screen.findByRole('button', { name: /deletar livro/i });
    await waitFor(() => expect(btn).toHaveAttribute('data-tooltip'));
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn.getAttribute('data-tooltip')).toMatch(/venda do título/i);

    await userEvent.click(btn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'DELETE'),
    ).toHaveLength(0);
  });

  it('ao criar não há botão Deletar', () => {
    renderForm('/backoffice/livros/novo');
    expect(screen.queryByRole('button', { name: /deletar livro/i })).not.toBeInTheDocument();
  });

  it('DELETE 409 (venda entrou durante a edição): mostra o erro e não navega', async () => {
    stubFetch({ deleteStatus: 409 });
    renderForm('/backoffice/livros/b1/editar');

    const btn = await screen.findByRole('button', { name: /deletar livro/i });
    await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(await screen.findByText(/ganhou uma venda/i)).toBeInTheDocument();
    expect(screen.queryByText('LISTA LIVROS')).not.toBeInTheDocument();
  });
});
