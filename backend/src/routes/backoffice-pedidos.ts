import { Hono } from 'hono';
import {
  BatchWriteCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { isOrderStatus, isUnitFinalized } from '../lib/order-status';
import type { OrderStatus } from '../lib/order-status';
import { computeStock } from '../lib/stock';
import { jwtMiddleware } from '../middlewares/jwt';
import { requireRole } from '../middlewares/require-role';

// campos do agrupador (iguais em todas as linhas do pedido)
// ordered_at: "Pedido em" editável pelo admin (created_at fica intocado)
const ORDER_FIELDS = ['name', 'contact', 'region', 'created_at', 'ordered_at'] as const;
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
  'finalized_at', // "Finalizado em" editável pelo admin (updated_at fica intocado)
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

async function sendUpdate(id: string, bookKey: unknown, spec: UpdateSpec) {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts = Object.entries(spec.sets).map(([field, value]) => {
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

// fluxo operacional: toda mudança carimba updated_at (data de finalização)
async function applyUpdate(id: string, bookKey: unknown, spec: UpdateSpec) {
  await sendUpdate(id, bookKey, {
    sets: { ...spec.sets, updated_at: new Date().toISOString() },
    removes: spec.removes,
  });
}

// edição administrativa: corrige dados SEM tocar created_at/updated_at
async function applyEdit(id: string, bookKey: unknown, spec: UpdateSpec) {
  await sendUpdate(id, bookKey, spec);
}

// datas editáveis aceitam YYYY-MM-DD (vira meio-dia UTC, sem recuo de fuso) ou ISO completo
function parseEditDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00.000Z`;
  if (!Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
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

// ── Edição administrativa (corrige dados sem tocar created_at/updated_at) ──

// dados do agrupador: name e ordered_at ("Pedido em") em TODAS as linhas
backofficePedidos.put('/:id', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  const sets: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '' || body.name.length > 80) {
      return c.json({ error: 'name must be a string with 1..80 characters' }, 400);
    }
    sets.name = body.name.trim();
  }
  if (body.ordered_at !== undefined) {
    const parsed = parseEditDate(body.ordered_at);
    if (!parsed) return c.json({ error: 'ordered_at must be an ISO date' }, 400);
    sets.ordered_at = parsed;
  }
  if (Object.keys(sets).length === 0) {
    return c.json({ error: 'nothing to update' }, 400);
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

  for (const line of lines) {
    await applyEdit(id, line.book_id, { sets, removes: [] });
  }
  return c.json({ id, updated: lines.length });
});

// dados da unidade: valor, finalizado em, status (set direto com efeitos de
// estoque preservados), preço social e observação
backofficePedidos.put('/:id/unidades/:unitId', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  const spec: UpdateSpec = { sets: {}, removes: [] };
  if (body.received_amount !== undefined) {
    if (
      typeof body.received_amount !== 'number' ||
      !Number.isInteger(body.received_amount) ||
      body.received_amount < 0
    ) {
      return c.json({ error: 'received_amount must be a non-negative integer (cents)' }, 400);
    }
    spec.sets.received_amount = body.received_amount;
  }
  if (body.finalized_at !== undefined) {
    const parsed = parseEditDate(body.finalized_at);
    if (!parsed) return c.json({ error: 'finalized_at must be an ISO date' }, 400);
    spec.sets.finalized_at = parsed;
  }
  if (body.social_price !== undefined) {
    if (typeof body.social_price !== 'boolean') {
      return c.json({ error: 'social_price must be a boolean' }, 400);
    }
    if (body.social_price) spec.sets.social_price = true;
    else spec.removes.push('social_price');
  }
  if (body.observation !== undefined) {
    if (typeof body.observation !== 'string' || body.observation.length > MAX_OBSERVATION_CHARS) {
      return c.json({ error: `observation must be at most ${MAX_OBSERVATION_CHARS} characters` }, 400);
    }
    const observation = body.observation.trim();
    if (observation === '') spec.removes.push('observation');
    else spec.sets.observation = observation;
  }
  if (body.status !== undefined && !isOrderStatus(body.status)) {
    return c.json({ error: 'status must be a valid order status' }, 400);
  }
  if (body.status === undefined && Object.keys(spec.sets).length === 0 && spec.removes.length === 0) {
    return c.json({ error: 'nothing to update' }, 400);
  }

  const id = c.req.param('id');
  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': id },
    }),
  );
  const line = (existing.Items ?? []).find((item) => item.unit_id === c.req.param('unitId'));
  if (!line) return c.json({ error: 'not found' }, 404);

  if (body.status !== undefined) {
    const target = body.status as OrderStatus;
    spec.sets.status = target;
    if (target === 'cancelled') {
      spec.removes.push('lote_id', 'picked_up', 'cancel_requested');
    } else if (target === 'waiting-payment' && line.picked_up !== true) {
      // sem retirada, waiting não segura estoque
      if (line.lote_id) spec.removes.push('lote_id');
    } else if (target !== 'waiting-payment' && !line.lote_id) {
      // entrou em estado que deduz sem lote: aloca FIFO
      const loteId = await allocateLote(line);
      if (!loteId) {
        return c.json({ error: 'no available stock in region to allocate this unit' }, 400);
      }
      spec.sets.lote_id = loteId;
    }
  }

  await applyEdit(id, line.book_id, spec);
  return c.json({ id, unit_id: line.unit_id, edited: true });
});

// ── Remoção definitiva (≠ cancelar: apaga da base, sem histórico) ──

backofficePedidos.delete('/:id', requireRole('admin'), async (c) => {
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

  const BATCH = 25;
  for (let i = 0; i < lines.length; i += BATCH) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [process.env.PEDIDOS_TABLE_NAME!]: lines
            .slice(i, i + BATCH)
            .map((line) => ({ DeleteRequest: { Key: { id, book_id: line.book_id } } })),
        },
      }),
    );
  }
  return c.json({ id, deleted: lines.length });
});

backofficePedidos.delete('/:id/unidades/:unitId', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': id },
    }),
  );
  const line = (existing.Items ?? []).find((item) => item.unit_id === c.req.param('unitId'));
  if (!line) return c.json({ error: 'not found' }, 404);

  await docClient.send(
    new DeleteCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      Key: { id, book_id: line.book_id },
    }),
  );
  return c.json({ id, unit_id: line.unit_id, deleted: 1 });
});
