import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { ApiError, apiAuthGet, apiAuthPost, apiGet } from '../../api/client';
import { clearToken } from '../../backoffice/auth';
import { formatLoteDate } from '../../backoffice/lotes';
import type { LoteDetailData, LoteTransaction } from '../../backoffice/lotes';
import { CoverThumb } from '../../components/CoverThumb';
import { formatPrice, textToCents } from '../../lib/format';
import type { Book } from '../../lib/types';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const RECEIPT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return dataUrl.split(',')[1] ?? '';
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unauthorized' }
  | { kind: 'ready'; lote: LoteDetailData; titles: Map<string, string> };

export function LoteDetail() {
  const { id } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [formOpen, setFormOpen] = useState(false);
  const [txType, setTxType] = useState<'entrada' | 'saida'>('entrada');
  const [txValue, setTxValue] = useState('');
  const [txRecipient, setTxRecipient] = useState('');
  const [txDate, setTxDate] = useState(todayISO());
  const [txFile, setTxFile] = useState<File | null>(null);
  const [txError, setTxError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [lote, livros] = await Promise.all([
        apiAuthGet<LoteDetailData>(`/backoffice/lotes/${id}`),
        apiGet<Book[]>('/livros'),
      ]);
      setState({
        kind: 'ready',
        lote,
        titles: new Map(livros.map((b) => [b.id, b.title])),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setState({ kind: 'unauthorized' });
        return;
      }
      setState({ kind: 'error' });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFileChange(file: File | null) {
    setTxError('');
    setTxFile(null);
    if (!file) return;
    if (!RECEIPT_TYPES[file.type]) {
      setTxError('Comprovante deve ser PNG, JPG ou PDF.');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setTxError('Comprovante deve ter no máximo 5MB.');
      return;
    }
    setTxFile(file);
  }

  async function openReceipt(tx: LoteTransaction) {
    try {
      const { url } = await apiAuthGet<{ url: string }>(
        `/backoffice/lotes/${id}/transacoes/${tx.id}/comprovante`,
      );
      window.open(url, '_blank');
    } catch {
      setTxError('Não foi possível abrir o comprovante.');
    }
  }

  async function submitTransaction(e: { preventDefault: () => void }) {
    e.preventDefault();
    const cents = textToCents(txValue);
    if (cents === null || cents === 0) {
      setTxError('Informe um valor válido (ex.: 30,00).');
      return;
    }
    if (!txRecipient.trim()) {
      setTxError('Informe o destinatário.');
      return;
    }
    if (txError) return;

    setSaving(true);
    setTxError('');
    try {
      const payload: Record<string, unknown> = {
        date: txDate,
        recipient: txRecipient.trim(),
        amount: txType === 'saida' ? -cents : cents,
      };
      if (txFile) {
        payload.receipt_base64 = await fileToBase64(txFile);
        payload.receipt_type = RECEIPT_TYPES[txFile.type];
      }
      await apiAuthPost(`/backoffice/lotes/${id}/transacoes`, payload);
      setFormOpen(false);
      setTxValue('');
      setTxRecipient('');
      setTxFile(null);
      setTxDate(todayISO());
      await load();
    } catch {
      setTxError('Não foi possível salvar a transação.');
    } finally {
      setSaving(false);
    }
  }

  if (state.kind === 'unauthorized') return <RedirectToLogin />;
  if (state.kind === 'loading') return <div className="bo-loading">Carregando…</div>;
  if (state.kind === 'error') {
    return (
      <div className="bo-state">
        <div className="alert alert--error">Não foi possível carregar o lote.</div>
        <button className="btn btn--secondary" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  const { lote, titles } = state;
  const saldo = lote.sold_value + lote.transactions_total - lote.total_cost;
  const titleOf = (bookId: string) => titles.get(bookId) ?? bookId;

  return (
    <div className="bo-content">
      <div className="livro-form__header">
        <Link to="/backoffice/lotes">← Voltar pros lotes</Link>
        <span className="livro-form__title">Lote de {formatLoteDate(lote.date)}</span>
      </div>

      <div className="lote-detail__summary">
        <div>
          <span className="lote-detail__label">Região</span>
          <span>{lote.region}</span>
        </div>
        <div>
          <span className="lote-detail__label">Gasto</span>
          <span className="lotes-table__cost">{formatPrice(lote.total_cost)}</span>
        </div>
        <div>
          <span className="lote-detail__label">Vendido</span>
          <span className="lotes-table__sold">{formatPrice(lote.sold_value)}</span>
        </div>
        <div>
          <span className="lote-detail__label">Transações</span>
          <span
            className={`lotes-table__saldo${lote.transactions_total >= 0 ? ' lotes-table__saldo--positive' : ''}`}
          >
            {formatPrice(lote.transactions_total)}
          </span>
        </div>
        <div>
          <span className="lote-detail__label">Saldo</span>
          <span
            className={`lotes-table__saldo${saldo >= 0 ? ' lotes-table__saldo--positive' : ''}`}
          >
            {formatPrice(saldo)}
          </span>
        </div>
      </div>

      <div className="lote-detail__scroll">
      <div className="lote-detail__cols">
        <span>Livro</span>
        <span className="t-center">Adquirido</span>
        <span className="t-center">Reservado</span>
        <span className="t-center">Retirado</span>
        <span className="t-center">Vendido</span>
        <span className="t-center">Restante</span>
      </div>
      {lote.books.map((book) => (
        <div key={book.book_id} className="lote-detail__row">
          <span className="lote-detail__title">{titleOf(book.book_id)}</span>
          <span className="t-center">{book.acquired}</span>
          <span className="t-center">{book.reserved}</span>
          <span className="t-center">{book.picked_up}</span>
          <span className="t-center">{book.sold}</span>
          <span
            className={`t-center lote-detail__remaining${book.remaining === 0 ? ' lote-detail__remaining--zero' : ''}`}
          >
            {book.remaining}
          </span>
        </div>
      ))}
      </div>

      <div className="lote-history">
        <div className="lote-history__header">
          <span className="lote-form__section">Histórico do lote</span>
          <button
            className="btn btn--secondary"
            aria-expanded={formOpen}
            onClick={() => setFormOpen((v) => !v)}
          >
            {formOpen ? 'Cancelar' : 'Adicionar Transação'}
          </button>
        </div>

        {formOpen && (
          <form className="lote-tx-form" onSubmit={(e) => void submitTransaction(e)}>
            <div className="livro-form__grid">
              <div>
                <label className="field-label" htmlFor="tx-tipo">
                  Tipo
                </label>
                <select
                  id="tx-tipo"
                  className="field-input"
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as 'entrada' | 'saida')}
                >
                  <option value="entrada">Entrada (+) — ex.: contribuição</option>
                  <option value="saida">Saída (−) — ex.: doação, perda</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="tx-valor">
                  Valor (R$)
                </label>
                <input
                  id="tx-valor"
                  className="field-input"
                  placeholder="30,00"
                  value={txValue}
                  onChange={(e) => setTxValue(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="tx-destinatario">
                  Destinatário
                </label>
                <input
                  id="tx-destinatario"
                  className="field-input"
                  value={txRecipient}
                  onChange={(e) => setTxRecipient(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="tx-data">
                  Data da transação
                </label>
                <input
                  id="tx-data"
                  type="date"
                  className="field-input"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
            </div>
            <label className="field-label" htmlFor="tx-comprovante">
              Comprovante pix (PNG, JPG ou PDF — máx 5MB)
            </label>
            <input
              id="tx-comprovante"
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="livro-form__file"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            {txFile && <div className="livro-form__file-ok">✓ {txFile.name}</div>}
            {txError && <div className="field-error">{txError}</div>}
            <button className="btn btn--primary" type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar transação'}
            </button>
          </form>
        )}

        <div className="lote-history__event">
          <div className="lote-history__event-header">
            <span className="lote-history__date">{formatLoteDate(lote.date)}</span>
            <span className="lote-history__kind">Compra do lote</span>
            <span className="lotes-table__cost">{formatPrice(lote.total_cost)}</span>
          </div>
          <div className="lote-history__books">
            {lote.books.map((book) => (
              <div key={book.book_id} className="lote-history__book">
                <CoverThumb id={book.book_id} title={titleOf(book.book_id)} />
                <span className="lote-history__book-qty">{book.acquired}×</span>
                <span className="lote-history__book-title">{titleOf(book.book_id)}</span>
              </div>
            ))}
          </div>
        </div>

        {[...lote.transactions]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((tx) => (
            <div key={tx.id} className="lote-history__event">
              <div className="lote-history__event-header">
                <span className="lote-history__date">{formatLoteDate(tx.date)}</span>
                <span className="lote-history__kind">
                  {tx.amount < 0 ? 'Saída' : 'Entrada'} · {tx.recipient}
                </span>
                <span
                  className={`lotes-table__saldo${tx.amount >= 0 ? ' lotes-table__saldo--positive' : ''}`}
                >
                  {formatPrice(tx.amount)}
                </span>
              </div>
              {tx.receipt_key && (
                <button className="stage-action" onClick={() => void openReceipt(tx)}>
                  Ver comprovante
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
