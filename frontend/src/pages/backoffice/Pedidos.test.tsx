import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Pedidos } from './Pedidos';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, social_price: 3000, description: '', amount: 3, status: 'disponível' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, social_price: 2000, description: '', amount: 0, status: 'disponível' },
];

interface UnitItem {
  unit_id: string;
  title_id: string;
  status: string;
  picked_up?: boolean;
  received_amount?: number;
}

function order(id: string, items: UnitItem[], over: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Camarada Rosa',
    contact: '(11) 9 8888-0000',
    region: 'SP, Capital - Zona Sul',
    created_at: '2026-07-09T14:00:00.000Z',
    items,
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(orders: unknown[]) {
  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH') {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    if (u.includes('/backoffice/pedidos')) {
      return Promise.resolve(new Response(JSON.stringify(orders), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/pedidos']}>
      <Routes>
        <Route path="/backoffice" element={<div>LOGIN PAGE</div>} />
        <Route path="/backoffice/pedidos" element={<Pedidos />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('Backoffice — Pedidos (linhas por unidade)', () => {
  it('duas unidades do MESMO título renderizam duas linhas', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b1', status: 'waiting-payment' },
      ]),
    ]);
    renderPage();

    expect(await screen.findByText('Camarada Rosa')).toBeInTheDocument();
    expect(screen.getAllByText('A Comuna e o Fogo')).toHaveLength(2);
    // total do pedido = 2 × 42,00
    expect(screen.getByText('R$ 84,00')).toBeInTheDocument();
    // valor de cada linha = preço unitário
    expect(screen.getAllByText('R$ 42,00')).toHaveLength(2);
  });

  it('avançar status chama PATCH com o unit_id da linha', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b2', status: 'payment-received' },
      ]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /enviar p\/ entrega/i }));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const [url, init] = patchCall as [string, RequestInit];
    expect(url).toMatch(/\/backoffice\/pedidos\/PED001\/status$/);
    expect(JSON.parse(init.body as string)).toEqual({
      status: 'sent-to-delivery',
      unit_id: 'u2',
    });
  });

  it('pedido com todas as unidades entregues não aparece em Pedidos', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'received' }]),
    ]);
    renderPage();

    expect(await screen.findByText(/nenhum pedido pendente/i)).toBeInTheDocument();
  });

  it('unidade em waiting mostra Reservar, Retirado s/ pagamento e Confirmar pagamento', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
    ]);
    renderPage();

    expect(await screen.findByRole('button', { name: /^reservar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^retirado s\/ pagamento$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar pagamento/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^reservar$/i }));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      status: 'in-reserve',
      unit_id: 'u1',
    });
  });

  it('unidade em reserva: Liberar reserva volta pra waiting', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'in-reserve' }]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /liberar reserva/i }));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      status: 'waiting-payment',
      unit_id: 'u1',
    });
  });

  it('Confirmar pagamento expande input com o preço default e envia received_amount editado', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'in-reserve' }]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /confirmar pagamento/i }));

    const input = screen.getByLabelText(/valor recebido/i);
    expect(input).toHaveValue('42,00'); // default = preço do título

    await userEvent.clear(input);
    await userEvent.type(input, '100,00'); // doação acima do preço
    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      status: 'payment-received',
      unit_id: 'u1',
      received_amount: 10000,
    });
  });

  it('Retirado s/ pagamento marca picked_up; unidade retirada tem badge, Confirmar pagamento e Desfazer', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b2', status: 'waiting-payment', picked_up: true },
      ]),
    ]);
    renderPage();

    // marca a primeira como retirada
    await userEvent.click(await screen.findByRole('button', { name: /^retirado s\/ pagamento$/i }));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      picked_up: true,
      unit_id: 'u1',
    });

    // a segunda (já retirada) tem badge e ação de desfazer
    expect(
      screen.getByText(/retirado sem pagamento/i, { selector: '.unit-picked-badge' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /desfazer retirado/i }));
    const undoCall = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').pop();
    expect(JSON.parse((undoCall![1] as RequestInit).body as string)).toEqual({
      picked_up: false,
      unit_id: 'u2',
    });
  });

  it('erro 400 na transição (sem estoque) mostra alerta', async () => {
    fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'no available stock' }), { status: 400 }),
        );
      }
      if (String(url).includes('/backoffice/pedidos')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
            ]),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /^reservar$/i }));

    expect(await screen.findByText(/sem estoque disponível/i)).toBeInTheDocument();
  });

  it('mostra a coluna Disponível com o estoque atual do título', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
    ]);
    renderPage();

    await screen.findByText('A Comuna e o Fogo');
    expect(screen.getByText('Disponível')).toBeInTheDocument();
    const row = screen.getByText('A Comuna e o Fogo').closest('.order-card__row')!;
    expect(row.querySelector('.order-card__available')!.textContent).toBe('3');
  });

  it('ações disparam toast temporário em vez de alerta fixo', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /^reservar$/i }));

    const toast = await screen.findByText(/em reserva/i, { selector: '.toast *' });
    expect(toast).toBeInTheDocument();
    // não existe mais alerta fixo no topo
    expect(document.querySelector('.bo-last-action')).toBeNull();
  });

  it('tem botão de reload que refaz a busca', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
    ]);
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /recarregar/i }));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('unidade em reserva mostra pill excepcional e progresso de 4 estágios no índice 0', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'in-reserve' }]),
    ]);
    renderPage();

    await screen.findByText('Em Reserva');
    expect(document.querySelectorAll('.stage-seg')).toHaveLength(4);
    expect(document.querySelector('.stage-pill--reserve')).toBeInTheDocument();
  });

  it('reload após ação NÃO pisca a tela: lista continua visível durante o refresh', async () => {
    let resolveSecondGet: ((r: Response) => void) | null = null;
    let getCount = 0;
    fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PATCH') {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (u.includes('/backoffice/pedidos')) {
        getCount += 1;
        if (getCount > 1) {
          // segundo GET fica pendente até o teste liberar
          return new Promise<Response>((resolve) => {
            resolveSecondGet = resolve;
          });
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
            ]),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await screen.findByText('A Comuna e o Fogo');
    await userEvent.click(screen.getByRole('button', { name: /^reservar$/i }));

    // refresh em andamento: dados antigos permanecem, sem "Carregando…"
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument();

    resolveSecondGet!(
      new Response(
        JSON.stringify([
          order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'in-reserve' }]),
        ]),
        { status: 200 },
      ),
    );
    expect(await screen.findByText('Em Reserva')).toBeInTheDocument();
  });

  it('Disponível 0 aparece em destaque com badge "sem estoque" na unidade aguardando', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b2', status: 'waiting-payment' }]),
    ]);
    // b2 sem estoque
    renderPage();

    await screen.findByText('O Pão e as Rosas');
    const available = document.querySelector('.order-card__available')!;
    expect(available.classList.contains('order-card__available--zero')).toBe(true);
    expect(screen.getByText(/sem estoque/i, { selector: '.unit-no-stock-badge' })).toBeInTheDocument();
  });

  it('busca filtra por nome do cliente e chips filtram por status', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
      order('PED002', [{ unit_id: 'u2', title_id: 'b1', status: 'payment-received' }], {
        name: 'J. Prestes',
      }),
    ]);
    renderPage();
    await screen.findByText('Camarada Rosa');

    // busca por nome
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'prestes');
    await waitFor(() => expect(screen.queryByText('Camarada Rosa')).not.toBeInTheDocument());
    expect(screen.getByText('J. Prestes')).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText(/buscar/i));

    // chip de status
    await screen.findByText('Camarada Rosa');
    await userEvent.click(screen.getByRole('button', { name: /^pagos$/i }));
    expect(screen.queryByText('Camarada Rosa')).not.toBeInTheDocument();
    expect(screen.getByText('J. Prestes')).toBeInTheDocument();
  });

  it('contato vira link de WhatsApp quando é telefone e mailto quando é e-mail', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
      order('PED002', [{ unit_id: 'u2', title_id: 'b1', status: 'waiting-payment' }], {
        name: 'J. Prestes',
        contact: 'jprestes@email.com',
      }),
    ]);
    renderPage();
    await screen.findByText('Camarada Rosa');

    const wa = screen.getByRole('link', { name: /\(11\) 9 8888-0000/ });
    expect(wa).toHaveAttribute('href', 'https://wa.me/5511988880000');
    const mail = screen.getByRole('link', { name: /jprestes@email\.com/ });
    expect(mail).toHaveAttribute('href', 'mailto:jprestes@email.com');
  });

  it('input de pagamento: Enter confirma e Escape cancela', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'in-reserve' }]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /confirmar pagamento/i }));
    const input = screen.getByLabelText(/valor recebido/i);
    expect(input).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText(/valor recebido/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirmar pagamento/i }));
    await userEvent.keyboard('{Enter}');
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toMatchObject({
      status: 'payment-received',
      received_amount: 4200,
    });
  });

  it('Marcar entregue exige confirmação inline (irreversível)', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'sent-to-delivery' }]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /marcar entregue/i }));
    // ainda não chamou a API: pede confirmação
    expect(fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH')).toBeUndefined();

    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      status: 'received',
      unit_id: 'u1',
    });
  });

  it('fila de pendentes ordenada do mais antigo pro mais novo, com contagem', async () => {
    stubFetch([
      order('NOVO01', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }], {
        created_at: '2026-07-12T10:00:00.000Z',
      }),
      order('VELHO1', [{ unit_id: 'u2', title_id: 'b1', status: 'waiting-payment' }], {
        created_at: '2026-07-01T10:00:00.000Z',
      }),
    ]);
    renderPage();

    await screen.findByText('#NOV-O01');
    const ids = Array.from(document.querySelectorAll('.order-card__id')).map(
      (e) => e.textContent,
    );
    expect(ids).toEqual(['#VEL-HO1', '#NOV-O01']); // mais antigo primeiro
    expect(screen.getByText(/2 pedidos pendentes/i)).toBeInTheDocument();
  });

  it('total do cabeçalho usa o valor recebido quando existir (doações)', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'payment-received', received_amount: 10000 } as UnitItem & { received_amount: number },
        { unit_id: 'u2', title_id: 'b1', status: 'waiting-payment' },
      ]),
    ]);
    renderPage();

    await screen.findByText('Camarada Rosa');
    // 100,00 (recebido) + 42,00 (preço da unidade não paga)
    expect(screen.getByText('R$ 142,00')).toBeInTheDocument();
  });

  it('checkbox Preço social preenche o input com o preço social e grava a flag no PATCH', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /confirmar pagamento/i }));
    const input = screen.getByLabelText(/valor recebido/i);
    expect(input).toHaveValue('42,00');

    const checkbox = screen.getByRole('checkbox', { name: /preço social/i });
    await userEvent.click(checkbox);
    expect(input).toHaveValue('30,00');

    // desmarcar volta ao preço cheio; input segue editável
    await userEvent.click(checkbox);
    expect(input).toHaveValue('42,00');
    await userEvent.click(checkbox);

    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      status: 'payment-received',
      received_amount: 3000,
      social_price: true,
      unit_id: 'u1',
    });
  });

  it('Adicionar observação abre textarea inline e faz PATCH com o texto', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' }]),
    ]);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /adicionar observação/i }),
    );
    // ainda não chamou PATCH
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText(/observação/i), 'Entregar após as 18h');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      observation: 'Entregar após as 18h',
      unit_id: 'u1',
    });
  });

  it('unidade com observação mostra o texto clampado em 200 chars com ver mais/ver menos', async () => {
    const longa = 'obs '.repeat(80).trim(); // ~319 chars
    stubFetch([
      order('PED001', [
        {
          unit_id: 'u1',
          title_id: 'b1',
          status: 'waiting-payment',
          observation: longa,
        } as UnitItem & { observation: string },
      ]),
    ]);
    renderPage();

    await screen.findByText('Camarada Rosa');
    // clampado: não mostra o texto inteiro, tem "ver mais"
    expect(screen.queryByText(longa)).not.toBeInTheDocument();
    const verMais = screen.getByRole('button', { name: /ver mais/i });
    await userEvent.click(verMais);
    expect(screen.getByText(new RegExp(longa.slice(-20)))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver menos/i })).toBeInTheDocument();
    // ação vira "Editar observação"
    expect(screen.getByRole('button', { name: /editar observação/i })).toBeInTheDocument();
  });

  it('Cancelar item exige confirmação e faz PATCH {cancel, unit_id}', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b1', status: 'waiting-payment' },
      ]),
    ]);
    renderPage();

    const cancelButtons = await screen.findAllByRole('button', { name: /cancelar item/i });
    await userEvent.click(cancelButtons[0]);
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      cancel: true,
      unit_id: 'u1',
    });
  });

  it('unidade cancelada em pedido misto: pill Cancelado, sem ações; badge de solicitação', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'cancelled' },
        {
          unit_id: 'u2',
          title_id: 'b1',
          status: 'waiting-payment',
          cancel_requested: true,
        } as UnitItem & { cancel_requested: boolean },
      ]),
    ]);
    renderPage();

    await screen.findByText('Camarada Rosa');
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    // unidade cancelada não tem ações (só a pendente tem)
    expect(screen.getAllByRole('button', { name: /reservar/i })).toHaveLength(1);
    expect(screen.getByText(/cancelamento solicitado/i)).toBeInTheDocument();
  });

  it('pedido 100% cancelado sai da fila de Pedidos', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'cancelled' }]),
    ]);
    renderPage();

    expect(await screen.findByText(/nenhum pedido pendente/i)).toBeInTheDocument();
  });

  it('Cancelar itens do pedido (header) confirma e faz PATCH {cancel} sem unit_id', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b1', status: 'in-reserve' },
      ]),
    ]);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /cancelar itens do pedido/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ cancel: true });
  });

  it('Retirado s/ pagamento (todos): confirma e faz PATCH {picked_up:true} sem unit_id', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b1', status: 'in-reserve' },
      ]),
    ]);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /retirado s\/ pagamento \(todos\)/i }),
    );
    // confirmação avisa que muda TODOS os itens
    expect(screen.getByText(/todos os itens do pedido/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      picked_up: true,
    });
  });

  it('Desfazer retirada (todos) aparece quando há retirada não paga e faz PATCH {picked_up:false}', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment', picked_up: true },
        { unit_id: 'u2', title_id: 'b1', status: 'waiting-payment', picked_up: true },
      ]),
    ]);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /desfazer retirada \(todos\)/i }),
    );
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      picked_up: false,
    });
  });

  it('Verificar resumo abre modal agrupado; Copiar escreve no clipboard; overlay fecha', async () => {
    const user = userEvent.setup();
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b1', status: 'payment-received', received_amount: 10000 },
        { unit_id: 'u3', title_id: 'b2', status: 'cancelled' },
      ]),
    ]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /verificar resumo/i }));

    const modal = await screen.findByRole('dialog');
    // agrupado por título: 2× A Comuna (42,00 + 100,00), cancelado fora
    expect(modal.textContent).toContain('2× A Comuna e o Fogo');
    expect(modal.textContent).toContain('R$ 142,00');
    expect(modal.textContent).not.toContain('O Pão e as Rosas');

    await user.click(screen.getByRole('button', { name: /^copiar$/i }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain('#PED-001');
    expect(copied).toContain('2× A Comuna e o Fogo — R$ 142,00');
    expect(copied).toContain('Total: R$ 142,00');
    expect(await screen.findByText(/copiado/i)).toBeInTheDocument();

    // clicar no overlay (fora do conteúdo) fecha
    await user.click(document.querySelector('.modal-overlay')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('token expirado (401): limpa token e volta pro login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/backoffice/')) {
          return Promise.resolve(new Response('{}', { status: 401 }));
        }
        return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
      }),
    );
    renderPage();

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(sessionStorage.getItem('livraria:token')).toBeNull();
  });
});
