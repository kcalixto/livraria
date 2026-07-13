import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../cart/CartContext';
import { Carrinho } from './Carrinho';

function seedCart() {
  localStorage.setItem(
    'livraria:carrinho',
    JSON.stringify([
      { book_id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 1 },
      { book_id: 'b2', title: 'O Pão e as Rosas', price: 3800, amount: 2 },
    ]),
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CartProvider>
        <Carrinho />
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

describe('Carrinho', () => {
  it('vazio: mostra estado vazio com link para o catálogo', () => {
    renderPage();
    expect(screen.getByText(/seu carrinho está vazio/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver catálogo/i })).toBeInTheDocument();
  });

  it('lista itens com subtotal', () => {
    seedCart();
    renderPage();
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
    // subtotal = 4200 + 2*3800 = 11800
    expect(screen.getByText('R$ 118,00')).toBeInTheDocument();
  });

  it('cada item mostra a capa do livro (com fallback embutido)', () => {
    seedCart();
    renderPage();

    const covers = document.querySelectorAll('.cart-item__cover img');
    expect(covers).toHaveLength(2);
    expect((covers[0] as HTMLImageElement).getAttribute('src')).toBe('/images/dev/b1.jpg');
  });

  it('stepper altera quantidade e atualiza subtotal', async () => {
    seedCart();
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    // 2*4200 + 2*3800 = 16000
    expect(screen.getByText('R$ 160,00')).toBeInTheDocument();
  });

  it('remover tira o item da lista', async () => {
    seedCart();
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /remover/i })[0]);
    expect(screen.queryByText('A Comuna e o Fogo')).not.toBeInTheDocument();
  });

  it('gerar pedido abre o form e valida campos obrigatórios', async () => {
    seedCart();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /gerar pedido/i }));
    expect(screen.getByLabelText(/nome ou vulgo/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));
    expect(screen.getByText(/informe seu nome ou vulgo/i)).toBeInTheDocument();
    expect(screen.getByText(/informe um contato/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia o pedido e mostra o código com hífen e aviso pra guardar, limpando o carrinho', async () => {
    seedCart();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'AJ3C9K' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /gerar pedido/i }));
    await userEvent.type(screen.getByLabelText(/nome ou vulgo/i), 'Camarada Rosa');
    await userEvent.type(screen.getByLabelText(/contato/i), '(11) 9 8888-0000');
    await userEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));

    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument();
    expect(screen.getByText(/AJ3-C9K/)).toBeInTheDocument();
    expect(screen.getByText(/guarde o código/i)).toBeInTheDocument();
    // acompanhamento já sai com o código na query (prefill da consulta)
    expect(screen.getByRole('link', { name: /acompanhar pedido/i })).toHaveAttribute(
      'href',
      '/pedido?codigo=AJ3C9K',
    );
    expect(JSON.parse(localStorage.getItem('livraria:carrinho')!)).toEqual([]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/pedidos$/);
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Camarada Rosa',
      contact: '(11) 9 8888-0000',
      region: 'SP, Capital - Zona Sul',
      items: [
        { book_id: 'b1', amount: 1 },
        { book_id: 'b2', amount: 2 },
      ],
    });
  });

  it('mostra erro quando a API falha, sem limpar o carrinho', async () => {
    seedCart();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 500 })));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /gerar pedido/i }));
    await userEvent.type(screen.getByLabelText(/nome ou vulgo/i), 'X');
    await userEvent.type(screen.getByLabelText(/contato/i), 'Y');
    await userEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));

    expect(await screen.findByText(/não foi possível enviar o pedido/i)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('livraria:carrinho')!)).toHaveLength(2);
  });
});
