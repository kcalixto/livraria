import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  transactions_total: -3000,
  transactions: [
    {
      id: 'tx-1',
      date: '2026-07-12',
      recipient: 'Instituição X',
      amount: -3000,
      receipt_key: 'dev/comprovantes/lote-a/tx-1.pdf',
      created_at: '2026-07-12T10:00:00.000Z',
    },
  ],
  books: [
    { book_id: 'b1', acquired: 2, reserved: 1, picked_up: 0, sold: 1, remaining: 0 },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ id: 'tx-2' }), { status: 201 }));
    }
    if (u.includes('/comprovante')) {
      return Promise.resolve(
        new Response(JSON.stringify({ url: 'https://presigned.example/doc' }), { status: 200 }),
      );
    }
    if (u.includes('/backoffice/lotes/')) {
      return Promise.resolve(new Response(JSON.stringify(detalhe), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/lotes/lote-a']}>
      <Routes>
        <Route path="/backoffice/lotes/:id" element={<LoteDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Backoffice — Detalhe do lote', () => {
  it('saldo do resumo inclui transações (vendido + transações − custo)', async () => {
    renderPage();

    await screen.findAllByText('A Comuna e o Fogo');
    // 10000 − 3000 − 8000 = −1000
    expect(screen.getByText('-R$ 10,00')).toBeInTheDocument();
    // linha de transações no resumo
    expect(screen.getByText('-R$ 30,00', { selector: '.lote-detail__summary *' })).toBeInTheDocument();
  });

  it('histórico mostra a compra do lote com capas e as transações', async () => {
    renderPage();
    await screen.findAllByText('A Comuna e o Fogo');

    const compra = screen.getByText(/compra do lote/i).closest('.lote-history__event')!;
    expect(compra.textContent).toContain('01/07/2026');
    expect(compra.querySelector('.bo-livros__cover')).toBeInTheDocument();
    expect(compra.textContent).toContain('2×'); // quantidade adquirida

    const tx = screen.getByText(/Instituição X/).closest('.lote-history__event')!;
    expect(tx.textContent).toContain('12/07/2026');
    expect(tx.textContent).toContain('-R$ 30,00');
  });

  it('ver comprovante abre a URL pré-assinada', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    renderPage();
    await screen.findByText(/Instituição X/);

    await userEvent.click(screen.getByRole('button', { name: /ver comprovante/i }));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('https://presigned.example/doc', '_blank'),
    );
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/comprovante'));
    expect(String(call![0])).toMatch(/\/backoffice\/lotes\/lote-a\/transacoes\/tx-1\/comprovante$/);
  });

  it('adiciona transação de saída com valor negativo', async () => {
    renderPage();
    await screen.findAllByText('A Comuna e o Fogo');

    await userEvent.click(screen.getByRole('button', { name: /adicionar transação/i }));
    await userEvent.selectOptions(screen.getByLabelText(/tipo/i), 'saida');
    await userEvent.type(screen.getByLabelText(/valor/i), '30,00');
    await userEvent.type(screen.getByLabelText(/destinatário/i), 'Instituição Y');
    await userEvent.click(screen.getByRole('button', { name: /salvar transação/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toMatchObject({ recipient: 'Instituição Y', amount: -3000 });
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body).not.toHaveProperty('receipt_base64');
    });
  });

  it('anexa comprovante em base64 quando um arquivo é escolhido', async () => {
    renderPage();
    await screen.findAllByText('A Comuna e o Fogo');

    await userEvent.click(screen.getByRole('button', { name: /adicionar transação/i }));
    await userEvent.type(screen.getByLabelText(/valor/i), '20,00');
    await userEvent.type(screen.getByLabelText(/destinatário/i), 'Doador Z');
    const pdf = new File(['%PDF-1.4 conteudo'], 'comprovante.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/comprovante/i), pdf);
    await userEvent.click(screen.getByRole('button', { name: /salvar transação/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST');
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.receipt_type).toBe('pdf');
      expect(typeof body.receipt_base64).toBe('string');
      expect(body.receipt_base64.length).toBeGreaterThan(0);
      expect(body.amount).toBe(2000); // entrada (default) = positivo
    });
  });

  it('rejeita comprovante acima de 5MB no front', async () => {
    renderPage();
    await screen.findAllByText('A Comuna e o Fogo');

    await userEvent.click(screen.getByRole('button', { name: /adicionar transação/i }));
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.pdf', {
      type: 'application/pdf',
    });
    await userEvent.upload(screen.getByLabelText(/comprovante/i), big);

    expect(await screen.findByText(/no máximo 5MB/i)).toBeInTheDocument();
  });
});
