import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { centsToText, formatPrice } from '../../lib/format';
import { formatOrderDate, isUnitFinalized, shortOrderId } from '../../backoffice/order-status';
import type { Order, UnitItem } from '../../backoffice/order-status';
import { useOrders } from '../../backoffice/useOrders';
import type { BookInfo } from '../../backoffice/useOrders';

const PAGE_SIZE = 50;

interface SaleRow {
  order: Order;
  item: UnitItem;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function finalizedAt(row: SaleRow): string {
  return row.item.updated_at ?? row.order.created_at;
}

// hífen do código é só visual: normaliza os dois lados da busca
function normalizeId(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function saleValue(row: SaleRow, books: Map<string, BookInfo>): string {
  if (row.item.received_amount !== undefined) return formatPrice(row.item.received_amount);
  const book = books.get(row.item.title_id);
  return book ? formatPrice(book.price) : '—';
}

function csvDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function csvEscape(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function Vendas() {
  const { loading, error, unauthorized, orders, books, reload } = useOrders();
  const [monthStart, setMonthStart] = useState(currentMonth());
  const [monthEnd, setMonthEnd] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // todas as unidades finalizadas do período filtrado (CSV usa a lista cheia)
  const filtered = useMemo(() => {
    const query = normalizeId(search);
    const rows: SaleRow[] = orders.flatMap((order) =>
      order.items.filter(isUnitFinalized).map((item) => ({ order, item })),
    );
    return rows
      .filter((row) => {
        const month = finalizedAt(row).slice(0, 7);
        if (monthStart && month < monthStart) return false;
        if (monthEnd && month > monthEnd) return false;
        if (query && !normalizeId(row.order.id).includes(query)) return false;
        return true;
      })
      .sort((a, b) => finalizedAt(b).localeCompare(finalizedAt(a)));
  }, [orders, monthStart, monthEnd, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (unauthorized) return <Navigate to="/backoffice" replace />;
  if (loading) return <div className="bo-loading">Carregando…</div>;
  if (error) {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar as vendas.</div>
        <button className="btn btn--secondary" onClick={() => void reload()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  function exportCsv() {
    const header =
      'pedido;cliente;contato;livro;valor_recebido;data_pedido;data_pagamento;data_finalizacao';
    const lines = filtered.map(({ order, item }) => {
      const book = books.get(item.title_id);
      const value =
        item.received_amount !== undefined
          ? centsToText(item.received_amount)
          : book
            ? centsToText(book.price)
            : '';
      return [
        order.id,
        csvEscape(order.name),
        csvEscape(order.contact),
        csvEscape(book?.title ?? item.title_id),
        value,
        csvDate(order.created_at),
        csvDate(item.paid_at),
        csvDate(item.updated_at),
      ].join(';');
    });
    // BOM pro Excel pt-BR reconhecer UTF-8
    const blob = new Blob(['﻿' + [header, ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vendas-${monthStart}-${monthEnd}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bo-content">
      <div className="sales-filters">
        <div>
          <label className="field-label" htmlFor="vendas-inicio">
            De (mês)
          </label>
          <input
            id="vendas-inicio"
            type="month"
            className="field-input sales-filters__month"
            value={monthStart}
            onChange={(e) => {
              setMonthStart(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="vendas-fim">
            Até (mês)
          </label>
          <input
            id="vendas-fim"
            type="month"
            className="field-input sales-filters__month"
            value={monthEnd}
            onChange={(e) => {
              setMonthEnd(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="sales-filters__search">
          <label className="field-label" htmlFor="vendas-busca">
            Pedido
          </label>
          <input
            id="vendas-busca"
            className="field-input"
            placeholder="Buscar por id (com ou sem hífen)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <button className="btn btn--secondary sales-filters__export" onClick={exportCsv}>
          Exportar CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bo-empty">
          <div className="bo-empty__title">Nenhuma venda no período</div>
          <div className="bo-empty__sub">Ajuste o filtro de meses ou a busca.</div>
        </div>
      ) : (
        <>
          <div className="sales-table">
            <div className="sales-table__cols">
              <span>Pedido</span>
              <span>Cliente</span>
              <span>Livro</span>
              <span>Valor</span>
              <span>Pedido em</span>
              <span>Finalizado em</span>
              <span className="t-right">Status</span>
            </div>
            {visible.map(({ order, item }) => (
              <div key={item.unit_id} className="sales-table__row">
                <span className="sales-table__order-id">{shortOrderId(order.id)}</span>
                <span className="sales-table__name">{order.name}</span>
                <span className="sales-table__books">
                  {books.get(item.title_id)?.title ?? item.title_id}
                </span>
                <span className="sales-table__total">{saleValue({ order, item }, books)}</span>
                <span className="sales-table__date">{formatOrderDate(order.created_at)}</span>
                <span className="sales-table__date">
                  {item.updated_at ? formatOrderDate(item.updated_at) : '—'}
                </span>
                <span className="t-right">
                  <span className="badge badge--ok sales-table__status">Concluído</span>
                </span>
              </div>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="sales-pagination">
              <button
                className="stage-action"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                ← Anterior
              </button>
              <span className="sales-pagination__info">
                Página {currentPage + 1} de {pageCount} · {filtered.length} vendas
              </span>
              <button
                className="stage-action"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
