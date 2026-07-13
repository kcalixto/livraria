import { Hono } from 'hono';
import { QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { isOrderStatus, isUnitFinalized } from '../lib/order-status';
import type { OrderStatus } from '../lib/order-status';
import { computeStock } from '../lib/stock';
import { jwtMiddleware } from '../middlewares/jwt';
import { requireRole } from '../middlewares/require-role';

// campos do agrupador (iguais em todas as linhas do pedido)
const ORDER_FIELDS = ['name', 'contact', 'region', 'created_at'] as const;
// campos por unidade
const UNIT_FIELDS = [
  'unit_id',
  'title_id',
  'status',
  'lote_id',
  'received_amount',
  'picked_up',
  'paid_at',
  'observation',
  'social_price',
  'cancel_requested',
  'updated_at',
] as const;

// observação livre do operador, visível na consulta pública do pedido
const MAX_OBSERVATION_CHARS = 1000;

// Matriz de transições (CLAUDE.md). Reversas existem porque erro humano
// acontece: liberar reserva e desfazer retirado devolvem a unidade ao lote.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'waiting-payment': ['in-reserve', 'payment-received'],
  'in-reserve': ['waiting-payment', 'payment-received'],
  'payment-received': ['sent-to-delivery'],
  'sent-to-delivery': ['received'],
  received: [],
  cancelled: [], // terminal; cancelamento não é reversível (decisão do dono)
};
const PICKED_UP_TRANSITIONS: Record<string, OrderStatus[]> = {
  'waiting-payment': ['payment-received'],
};

// FIFO: lote mais antigo da região com unidade livre do título
async function allocateLote(unit: Record<string, unknown>): Promise<string | null> {
  const stock = await computeStock(String(unit.region));
  const titleId = String(unit.title_id);
  for (const lote of stock.fifo) {
    if ((stock.lotes[lote.id]?.books[titleId]?.remaining ?? 0) > 0) return lote.id;
  }
  return null;
}

interface UpdateSpec {
  sets: Record<string, unknown>;
  removes: string[];
}

async function applyUpdate(id: string, bookKey: unknown, spec: UpdateSpec) {
  const sets = { ...spec.sets, updated_at: new Date().toISOString() };
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts = Object.entries(sets).map(([field, value]) => {
    names[`#${field}`] = field;
    values[`:${field}`] = value;
    return `#${field} = :${field}`;
  });
  const removeParts = spec.removes.map((field) => {
    names[`#${field}`] = field;
    return `#${field}`;
  });

  let expression = `SET ${setParts.join(', ')}`;
  if (removeParts.length > 0) expression += ` REMOVE ${removeParts.join(', ')}`;

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      Key: { id, book_id: bookKey },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export const backofficePedidos = new Hono();

backofficePedidos.use('*', jwtMiddleware);

backofficePedidos.get('/', requireRole('viewer', 'admin'), async (c) => {
  const result = await docClient.send(
    new ScanCommand({ TableName: process.env.PEDIDOS_TABLE_NAME }),
  );
  const lines: Record<string, unknown>[] = result.Items ?? [];

  const byId = new Map<string, Record<string, unknown> & { items: unknown[] }>();
  for (const line of lines) {
    const id = line.id as string;
    let order = byId.get(id);
    if (!order) {
      order = { id, items: [] };
      for (const f of ORDER_FIELDS) order[f] = line[f];
      byId.set(id, order);
    }
    const item: Record<string, unknown> = {};
    for (const f of UNIT_FIELDS) {
      if (line[f] !== undefined) item[f] = line[f];
    }
    order.items.push(item);
  }

  const orders = [...byId.values()].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );
  return c.json(orders);
});

// cancelável = ainda não virou venda nem já foi cancelada
function isCancellable(line: Record<string, unknown>): boolean {
  return line.status !== 'cancelled' && !isUnitFinalized(line);
}

// cancelar devolve a unidade ao lote e limpa a retirada/solicitação
function cancelSpec(): UpdateSpec {
  return {
    sets: { status: 'cancelled' },
    removes: ['lote_id', 'picked_up', 'cancel_requested'],
  };
}

backofficePedidos.patch('/:id/status', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  const isCancel = body.cancel === true;
  const isPickupToggle = !isCancel && typeof body.picked_up === 'boolean';
  // ações em nível de pedido (cancel/picked_up sem unit_id) dispensam o unit_id
  if (!isCancel && !isPickupToggle && (typeof body.unit_id !== 'string' || body.unit_id === '')) {
    return c.json({ error: 'unit_id is required' }, 400);
  }
  const isObservation = !isCancel && !isPickupToggle && typeof body.observation === 'string';
  if (!isCancel && !isPickupToggle && !isObservation && !isOrderStatus(body.status)) {
    return c.json({ error: 'status must be a valid order status' }, 400);
  }
  if (isObservation && body.observation.length > MAX_OBSERVATION_CHARS) {
    return c.json({ error: `observation must be at most ${MAX_OBSERVATION_CHARS} characters` }, 400);
  }

  const id = c.req.param('id');
  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': id },
    }),
  );
  const lines = existing.Items ?? [];
  if (lines.length === 0) return c.json({ error: 'not found' }, 404);

  if (isCancel && !body.unit_id) {
    // cancela o pedido: todas as unidades ainda não finalizadas
    const eligible = lines.filter(isCancellable);
    if (eligible.length === 0) {
      return c.json({ error: 'no cancellable units in this order' }, 400);
    }
    for (const unitLine of eligible) {
      await applyUpdate(id, unitLine.book_id, cancelSpec());
    }
    return c.json({ id, cancelled: eligible.length });
  }

  // evento: retirada (ou desfazer) de TODAS as unidades do pedido de uma vez
  if (isPickupToggle && !body.unit_id) {
    if (body.picked_up === true) {
      const eligible = lines.filter(
        (l) =>
          l.picked_up !== true &&
          ['waiting-payment', 'in-reserve'].includes(String(l.status)),
      );
      if (eligible.length === 0) {
        return c.json({ error: 'no units eligible for pickup in this order' }, 400);
      }

      // valida o estoque de TODAS antes de aplicar qualquer mudança
      const stock = await computeStock(String(eligible[0].region));
      const allocations = new Map<unknown, string>();
      for (const l of eligible) {
        if (l.lote_id) continue; // reserva já segura um lote
        const titleId = String(l.title_id);
        const lote = stock.fifo.find(
          (candidate) => (stock.lotes[candidate.id]?.books[titleId]?.remaining ?? 0) > 0,
        );
        if (!lote) {
          return c.json({ error: 'no available stock in region to allocate this order' }, 400);
        }
        stock.lotes[lote.id].books[titleId].remaining -= 1;
        allocations.set(l, lote.id);
      }

      for (const l of eligible) {
        const spec: UpdateSpec = {
          sets: { picked_up: true, status: 'waiting-payment' },
          removes: [],
        };
        const loteId = allocations.get(l);
        if (loteId) spec.sets.lote_id = loteId;
        await applyUpdate(id, l.book_id, spec);
      }
      return c.json({ id, picked_up: eligible.length });
    }

    // reverso: desfaz toda retirada ainda não paga (devolve as unidades ao lote)
    const undoable = lines.filter(
      (l) => l.picked_up === true && l.status === 'waiting-payment',
    );
    if (undoable.length === 0) {
      return c.json({ error: 'no pickups to undo in this order' }, 400);
    }
    for (const l of undoable) {
      await applyUpdate(id, l.book_id, {
        sets: { status: 'waiting-payment' },
        removes: ['picked_up', 'lote_id'],
      });
    }
    return c.json({ id, undone: undoable.length });
  }

  const line = lines.find((item) => item.unit_id === body.unit_id);
  if (!line) return c.json({ error: 'not found' }, 404);

  if (isCancel) {
    if (!isCancellable(line)) {
      return c.json({ error: 'unit is finalized or already cancelled' }, 400);
    }
    await applyUpdate(id, line.book_id, cancelSpec());
    return c.json({ id, unit_id: body.unit_id, status: 'cancelled' });
  }

  const current = String(line.status) as OrderStatus;

  if (isObservation) {
    const observation = String(body.observation).trim();
    if (observation === '') {
      // limpar = remover o atributo
      await applyUpdate(id, line.book_id, { sets: {}, removes: ['observation'] });
      return c.json({ id, unit_id: body.unit_id, observation: null });
    }
    await applyUpdate(id, line.book_id, { sets: { observation }, removes: [] });
    return c.json({ id, unit_id: body.unit_id, observation });
  }

  if (isPickupToggle) {
    if (body.picked_up === true) {
      if (line.picked_up === true || !['waiting-payment', 'in-reserve'].includes(current)) {
        return c.json({ error: 'unit cannot be marked as picked up from this state' }, 400);
      }
      const spec: UpdateSpec = { sets: { picked_up: true, status: 'waiting-payment' }, removes: [] };
      if (!line.lote_id) {
        const loteId = await allocateLote(line);
        if (!loteId) {
          return c.json({ error: 'no available stock in region to allocate this unit' }, 400);
        }
        spec.sets.lote_id = loteId;
      }
      await applyUpdate(id, line.book_id, spec);
      return c.json({ id, unit_id: body.unit_id, picked_up: true, status: 'waiting-payment' });
    }

    // desfazer retirado: só antes do pagamento; devolve a unidade ao lote
    if (line.picked_up !== true || current !== 'waiting-payment') {
      return c.json({ error: 'picked up can only be undone before payment' }, 400);
    }
    await applyUpdate(id, line.book_id, {
      sets: { status: 'waiting-payment' },
      removes: ['picked_up', 'lote_id'],
    });
    return c.json({ id, unit_id: body.unit_id, picked_up: false, status: 'waiting-payment' });
  }

  const target = body.status as OrderStatus;
  const allowed =
    line.picked_up === true
      ? (PICKED_UP_TRANSITIONS[current] ?? [])
      : TRANSITIONS[current];
  if (!allowed.includes(target)) {
    return c.json({ error: `invalid transition: ${current} -> ${target}` }, 400);
  }

  const spec: UpdateSpec = { sets: { status: target }, removes: [] };

  if (target === 'payment-received') {
    if (
      typeof body.received_amount !== 'number' ||
      !Number.isInteger(body.received_amount) ||
      body.received_amount < 0
    ) {
      return c.json(
        { error: 'received_amount (non-negative integer, cents) is required' },
        400,
      );
    }
    spec.sets.received_amount = body.received_amount;
    spec.sets.paid_at = new Date().toISOString(); // data do pagamento (relatórios)
    // venda com preço social: rastreável nos relatórios
    if (body.social_price === true) spec.sets.social_price = true;
  }

  // entrada em estado que deduz estoque, ainda sem lote → aloca FIFO
  const entersDeducting = target === 'in-reserve' || target === 'payment-received';
  if (entersDeducting && !line.lote_id) {
    const loteId = await allocateLote(line);
    if (!loteId) {
      return c.json({ error: 'no available stock in region to allocate this unit' }, 400);
    }
    spec.sets.lote_id = loteId;
  }

  // liberar reserva devolve a unidade ao lote
  if (current === 'in-reserve' && target === 'waiting-payment') {
    spec.removes.push('lote_id');
  }

  await applyUpdate(id, line.book_id, spec);
  return c.json({ id, unit_id: body.unit_id, status: target });
});
