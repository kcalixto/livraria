import { useEffect, useState, type FormEvent } from "react";
import { ActionIcon } from "../../components/ActionIcon";
import { centsToText, formatPrice, textToCents } from "../../lib/format";

// Calculadora 100% local (sem backend): custo de produção de livretos e margem.
// Livreto = A4 frente e verso dobrada em A5 → 4 páginas por folha impressa.
const PAGES_PER_SHEET = 4;
const CONFIG_KEY = "livraria:calculadora-livretos";
const ITEMS_KEY = "livraria:calculadora-livretos:itens";

export interface CalcConfig {
  sheetsPerPack: number;
  packPriceCents: number;
  inkRefillPriceCents: number;
  sheetsPerRefill: number;
}

export interface CalcItem {
  id: string;
  title?: string;
  pages: number;
  priceCents: number;
  qty: number;
}

const isPositiveInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0;
const isNonNegativeInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

// custo (em centavos, fracionário) de uma folha impressa: papel + tinta
export function costPerSheet(c: CalcConfig): number {
  return c.packPriceCents / c.sheetsPerPack + c.inkRefillPriceCents / c.sheetsPerRefill;
}

export function calcItem(c: CalcConfig, item: CalcItem) {
  const sheets = Math.ceil(item.pages / PAGES_PER_SHEET);
  const unitCostCents = Math.round(sheets * costPerSheet(c));
  const unitMarginCents = item.priceCents - unitCostCents;
  const marginPercent = item.priceCents > 0 ? (unitMarginCents / item.priceCents) * 100 : 0;
  return { sheets, unitCostCents, unitMarginCents, marginPercent };
}

export function calcTotals(c: CalcConfig, items: CalcItem[]) {
  let revenueCents = 0;
  let costCents = 0;
  for (const item of items) {
    revenueCents += item.priceCents * item.qty;
    costCents += calcItem(c, item).unitCostCents * item.qty;
  }
  const marginCents = revenueCents - costCents;
  const marginPercent = revenueCents > 0 ? (marginCents / revenueCents) * 100 : 0;
  return { revenueCents, costCents, marginCents, marginPercent };
}

function loadConfig(): CalcConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (
      isPositiveInt(c?.sheetsPerPack) &&
      isNonNegativeInt(c?.packPriceCents) &&
      isNonNegativeInt(c?.inkRefillPriceCents) &&
      isPositiveInt(c?.sheetsPerRefill)
    ) {
      return c;
    }
  } catch {
    // localStorage corrompido: trata como sem configuração
  }
  return null;
}

function loadItems(): CalcItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ITEMS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i) =>
        typeof i?.id === "string" &&
        isPositiveInt(i.pages) &&
        isNonNegativeInt(i.priceCents) &&
        isPositiveInt(i.qty),
    );
  } catch {
    return [];
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const formatPercent = (p: number) => `${p.toFixed(1).replace(".", ",")}%`;

function parsePositiveInt(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

function ConfigModal({
  initial,
  onSave,
  onClose,
}: {
  initial: CalcConfig | null;
  onSave: (c: CalcConfig) => void;
  onClose: () => void;
}) {
  const [sheetsPerPack, setSheetsPerPack] = useState(
    initial ? String(initial.sheetsPerPack) : "",
  );
  const [packPrice, setPackPrice] = useState(
    initial ? centsToText(initial.packPriceCents) : "",
  );
  const [inkPrice, setInkPrice] = useState(
    initial ? centsToText(initial.inkRefillPriceCents) : "",
  );
  const [sheetsPerRefill, setSheetsPerRefill] = useState(
    initial ? String(initial.sheetsPerRefill) : "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = {
      sheetsPerPack: parsePositiveInt(sheetsPerPack),
      packPriceCents: textToCents(packPrice),
      inkRefillPriceCents: textToCents(inkPrice),
      sheetsPerRefill: parsePositiveInt(sheetsPerRefill),
    };
    if (
      c.sheetsPerPack === null ||
      c.packPriceCents === null ||
      c.inkRefillPriceCents === null ||
      c.sheetsPerRefill === null
    ) {
      setError("Preencha todos os campos: quantidades inteiras maiores que zero e preços em reais (ex.: 25,00).");
      return;
    }
    onSave(c as CalcConfig);
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Configuração">
        <div className="modal__header">
          <span className="modal__title">Configuração</span>
          <button className="modal__close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal__body">
            <div className="calc-config__section">Pacote de folhas (A4)</div>
            <label className="field-label" htmlFor="calc-sheets-pack">
              Folhas no pacote
            </label>
            <input
              id="calc-sheets-pack"
              className="field-input"
              inputMode="numeric"
              value={sheetsPerPack}
              onChange={(e) => setSheetsPerPack(e.target.value)}
            />
            <label className="field-label" htmlFor="calc-pack-price">
              Preço do pacote (R$)
            </label>
            <input
              id="calc-pack-price"
              className="field-input"
              inputMode="decimal"
              placeholder="0,00"
              value={packPrice}
              onChange={(e) => setPackPrice(e.target.value)}
            />
            <div className="calc-config__section">Refil de tinta</div>
            <label className="field-label" htmlFor="calc-ink-price">
              Preço do refil (R$)
            </label>
            <input
              id="calc-ink-price"
              className="field-input"
              inputMode="decimal"
              placeholder="0,00"
              value={inkPrice}
              onChange={(e) => setInkPrice(e.target.value)}
            />
            <label className="field-label" htmlFor="calc-sheets-refill">
              Folhas por refil
            </label>
            <input
              id="calc-sheets-refill"
              className="field-input"
              inputMode="numeric"
              value={sheetsPerRefill}
              onChange={(e) => setSheetsPerRefill(e.target.value)}
            />
            {error && <p className="field-error">{error}</p>}
          </div>
          <div className="modal__footer confirm-modal__footer">
            <button type="submit" className="btn btn--primary confirm-modal__btn">
              Salvar
            </button>
            <button
              type="button"
              className="btn btn--secondary confirm-modal__btn"
              onClick={onClose}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CalculadoraLivretos() {
  const [config, setConfig] = useState<CalcConfig | null>(loadConfig);
  const [items, setItems] = useState<CalcItem[]>(loadItems);
  const [configOpen, setConfigOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [pages, setPages] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  function saveConfig(c: CalcConfig) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    setConfig(c);
    setConfigOpen(false);
  }

  function saveItems(next: CalcItem[]) {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(next));
    setItems(next);
  }

  function addItem(e: FormEvent) {
    e.preventDefault();
    const p = parsePositiveInt(pages);
    const cents = textToCents(price);
    const q = parsePositiveInt(qty);
    if (p === null || cents === null || q === null) {
      setFormError("Informe páginas e quantidade (inteiros > 0) e o valor de venda (ex.: 5,00).");
      return;
    }
    const item: CalcItem = { id: newId(), pages: p, priceCents: cents, qty: q };
    if (title.trim()) item.title = title.trim();
    saveItems([...items, item]);
    setTitle("");
    setPages("");
    setPrice("");
    setQty("1");
    setFormError(null);
  }

  const totals = config ? calcTotals(config, items) : null;

  return (
    <div className="bo-content">
      <div className="stock-toolbar">
        <button className="btn btn--secondary" onClick={() => setConfigOpen(true)}>
          Configuração
        </button>
        {config && (
          <span className="calc-sheet-cost">
            Custo por folha impressa: {formatPrice(Math.round(costPerSheet(config)))}
            {" "}· 4 páginas = 1 folha (A4 frente e verso → A5)
          </span>
        )}
      </div>

      {!config ? (
        <div className="alert alert--warn">
          Configure o pacote de folhas e o refil de tinta para calcular os custos.
        </div>
      ) : (
        <>
          <form className="calc-form" onSubmit={addItem}>
            <div className="calc-form__field calc-form__field--title">
              <label className="field-label" htmlFor="calc-title">
                Título (opcional)
              </label>
              <input
                id="calc-title"
                className="field-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="calc-form__field">
              <label className="field-label" htmlFor="calc-pages">
                Nº de páginas
              </label>
              <input
                id="calc-pages"
                className="field-input"
                inputMode="numeric"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
              />
            </div>
            <div className="calc-form__field">
              <label className="field-label" htmlFor="calc-price">
                Valor de venda (R$)
              </label>
              <input
                id="calc-price"
                className="field-input"
                inputMode="decimal"
                placeholder="0,00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="calc-form__field">
              <label className="field-label" htmlFor="calc-qty">
                Quantidade
              </label>
              <input
                id="calc-qty"
                className="field-input"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--primary calc-form__submit">
              Adicionar
            </button>
          </form>
          {formError && <p className="field-error">{formError}</p>}

          {items.length === 0 ? (
            <div className="bo-empty">
              <div className="bo-empty__title">Nenhum livreto na lista</div>
              <div className="bo-empty__sub">
                Adicione páginas e valor de venda para ver o custo e a margem.
              </div>
            </div>
          ) : (
            <div className="calc-table-wrap">
              <div className="stock-table calc-table" role="table" aria-label="Livretos">
                <div className="stock-table__cols calc-table__grid" role="row">
                  <span role="columnheader">Livreto</span>
                  <span role="columnheader">Páginas</span>
                  <span role="columnheader">Folhas</span>
                  <span role="columnheader">Custo/un</span>
                  <span role="columnheader">Venda/un</span>
                  <span role="columnheader">Margem/un</span>
                  <span role="columnheader">Qtd</span>
                  <span role="columnheader" aria-label="Ações" />
                </div>
                {items.map((item, index) => {
                  const r = calcItem(config, item);
                  return (
                    <div
                      key={item.id}
                      className="stock-table__row calc-table__grid"
                      role="row"
                    >
                      <span className="stock-table__title" role="cell">
                        {item.title ?? `Livreto ${index + 1}`}
                      </span>
                      <span className="stock-qty" role="cell">{item.pages}</span>
                      <span className="stock-qty" role="cell">{r.sheets}</span>
                      <span className="stock-qty" role="cell">
                        {formatPrice(r.unitCostCents)}
                      </span>
                      <span className="stock-qty" role="cell">
                        {formatPrice(item.priceCents)}
                      </span>
                      <span
                        className={`stock-qty ${r.unitMarginCents < 0 ? "stock-qty--zero" : "stock-qty--ok"}`}
                        role="cell"
                      >
                        {formatPrice(r.unitMarginCents)} ({formatPercent(r.marginPercent)})
                      </span>
                      <span className="stock-qty" role="cell">{item.qty}</span>
                      <span role="cell">
                        <ActionIcon
                          icon="cancel"
                          label="Remover item"
                          variant="red"
                          onClick={() => saveItems(items.filter((i) => i.id !== item.id))}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totals && items.length > 0 && (
            <section className="calc-totals" aria-label="Totais">
              <div className="calc-totals__item">
                <span className="field-label">Receita total</span>
                <span className="calc-totals__value">{formatPrice(totals.revenueCents)}</span>
              </div>
              <div className="calc-totals__item">
                <span className="field-label">Custo de produção</span>
                <span className="calc-totals__value">{formatPrice(totals.costCents)}</span>
              </div>
              <div className="calc-totals__item">
                <span className="field-label">Margem de lucro</span>
                <span
                  className={`calc-totals__value ${totals.marginCents < 0 ? "stock-qty--zero" : "stock-qty--ok"}`}
                >
                  {formatPrice(totals.marginCents)}
                </span>
                <span className="calc-totals__percent">
                  {formatPercent(totals.marginPercent)}
                </span>
              </div>
            </section>
          )}
        </>
      )}

      {configOpen && (
        <ConfigModal
          initial={config}
          onSave={saveConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
