import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from './cart/CartContext';
import { AppRoutes } from './App';
import { SITE_PATH } from './lib/basename';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', description: '', price: 4200, amount: 3 },
];

// monta a árvore real de rotas sob o caminho do coletivo, como o CloudFront
// entrega: URL /manoel-lisboa/... + basename no Router
function renderAt(pathname: string) {
  return render(
    <MemoryRouter basename={SITE_PATH} initialEntries={[pathname]}>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(livros), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rotas sob o caminho do coletivo', () => {
  it('a raiz do caminho (/manoel-lisboa) abre o catálogo', async () => {
    renderAt('/manoel-lisboa');
    expect(await screen.findByRole('heading', { name: 'A Comuna e o Fogo' })).toBeInTheDocument();
  });

  it('rota interna (/manoel-lisboa/pedido) abre a consulta de pedido', async () => {
    renderAt('/manoel-lisboa/pedido');
    expect(await screen.findByRole('button', { name: /consultar/i })).toBeInTheDocument();
  });

  it('links do header já saem com o prefixo do caminho', async () => {
    renderAt('/manoel-lisboa');
    await screen.findByRole('heading', { name: 'A Comuna e o Fogo' });
    expect(screen.getByRole('link', { name: /consultar pedido/i })).toHaveAttribute(
      'href',
      '/manoel-lisboa/pedido',
    );
  });
});
