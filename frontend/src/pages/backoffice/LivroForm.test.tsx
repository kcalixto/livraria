import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LivroForm } from './LivroForm';

const existingBook = {
  id: 'b1',
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
  status: 'disponível',
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
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

  it('não tem campo de upload de capa e mostra o lembrete de build', () => {
    renderForm('/backoffice/livros/novo');

    expect(screen.queryByLabelText(/capa/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/a capa entra em frontend\/public\/images\/<stage>\/<id>\.jpg/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/novo build\/deploy do site/i)).toBeInTheDocument();
  });
});

describe('LivroForm — editar', () => {
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
