import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../api/client";
import { useCart } from "../cart/CartContext";
import { CoverThumb } from "../components/CoverThumb";
import { formatOrderCode, formatPrice } from "../lib/format";
import { ACTIVE_REGION_VALUE } from "../lib/region";

// WhatsApp da livraria (mesmo número que atende a entrega/retirada)
const LIVRARIA_WHATSAPP = "https://wa.me/5511933938090";

// marca do WhatsApp: o traço vem do próprio ícone oficial (balão + fone)
function WhatsAppGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.02c-1.5 0-2.97-.4-4.26-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.13 8.13 0 0 1-1.25-4.34c0-4.54 3.7-8.23 8.24-8.23 4.54 0 8.23 3.69 8.23 8.23 0 4.54-3.69 8.24-8.23 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.78.97-.14.16-.29.19-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.87.85-.87 2.07 0 1.23.89 2.41 1.01 2.58.12.16 1.74 2.66 4.22 3.73.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29z" />
    </svg>
  );
}

type Step = "cart" | "checkout" | "done";

interface FieldErrors {
  name?: string;
  contact?: string;
}

export function Carrinho() {
  const { items, total, setAmount, remove, clear } = useCart();
  const [step, setStep] = useState<Step>("cart");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState("");

  async function submit() {
    const nextErrors: FieldErrors = {};
    if (!name.trim()) nextErrors.name = "Informe seu nome ou vulgo.";
    if (!contact.trim())
      nextErrors.contact = "Informe um contato para enviarmos a confirmação.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSending(true);
    setApiError(false);
    try {
      const { id } = await apiPost<{ id: string }>("/pedidos", {
        name: name.trim(),
        contact: contact.trim(),
        region: ACTIVE_REGION_VALUE,
        items: items.map((i) => ({ book_id: i.book_id, amount: i.amount })),
      });
      setOrderId(id);
      clear();
      setStep("done");
    } catch {
      setApiError(true);
    } finally {
      setSending(false);
    }
  }

  if (step === "done") {
    return (
      <div className="page">
        <div className="cart-header">
          <Link to="/">← Continuar no catálogo</Link>
          <span className="cart-header__title">Seu carrinho</span>
        </div>
        <div className="order-done">
          <div className="order-done__check">✓</div>
          <div className="order-done__title">Pedido enviado</div>
          <p className="order-done__sub">
            Entraremos em contato para combinar a entrega/retirada.
          </p>
          <div className="order-done__id">
            Pedido <strong>#{formatOrderCode(orderId)}</strong>
          </div>
          <div className="alert alert--error order-done__warning">
            Guarde o código do pedido — ele é a única forma de consultá-lo
            depois!
          </div>
          {/* atalho pra combinar entrega/retirada: abre a conversa da livraria
              já com o código digitado, pra não depender da memória do cliente */}
          <a
            className="btn order-done__whatsapp"
            href={`${LIVRARIA_WHATSAPP}?text=${encodeURIComponent(
              `Olá! Fiz o pedido #${formatOrderCode(orderId)} nas Edições Manoel Lisboa.`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppGlyph />
            Enviar pelo WhatsApp
          </a>
          <Link to={`/pedido?codigo=${orderId}`} className="order-done__track">
            Acompanhar pedido
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="page">
        <div className="cart-header">
          <Link to="/">← Continuar no catálogo</Link>
          <span className="cart-header__title">Seu carrinho</span>
        </div>
        <div className="cart-empty">
          <div className="cart-empty__icon">［ ］</div>
          <div className="cart-empty__title">Seu carrinho está vazio</div>
          <p>Escolha edições no catálogo para começar um pedido.</p>
          <Link to="/" className="btn btn--secondary">
            Ver catálogo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="cart-header">
        <Link to="/">← Continuar no catálogo</Link>
        <span className="cart-header__title">
          {step === "cart" ? "Seu carrinho" : "Finalizar pedido"}
        </span>
      </div>

      {step === "cart" && (
        <div className="cart">
          <div className="cart__items">
            {items.map((item) => (
              <div key={item.book_id} className="cart-item">
                <span className="cart-item__cover">
                  <CoverThumb slug={item.slug} title={item.title} />
                </span>
                <div>
                  <div className="cart-item__title">{item.title}</div>
                  <div className="cart-item__controls">
                    <div className="stepper">
                      <button
                        className="stepper__btn"
                        aria-label="−"
                        onClick={() => setAmount(item.book_id, item.amount - 1)}
                      >
                        −
                      </button>
                      <span className="stepper__value">{item.amount}</span>
                      <button
                        className="stepper__btn"
                        aria-label="+"
                        onClick={() => setAmount(item.book_id, item.amount + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="cart-item__remove"
                      onClick={() => remove(item.book_id)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
                <div className="cart-item__line">
                  {formatPrice(item.amount * item.price)}
                </div>
              </div>
            ))}
          </div>
          <div className="cart__footer">
            <div className="cart__subtotal">
              <span>Subtotal</span>
              <span className="cart__subtotal-value">{formatPrice(total)}</span>
            </div>
            <p className="cart__note">
              Frete e retirada combinados na etapa do pedido.
            </p>
            <button
              className="btn btn--primary btn--block"
              onClick={() => setStep("checkout")}
            >
              Gerar pedido
            </button>
          </div>
        </div>
      )}

      {step === "checkout" && (
        <div className="checkout">
          <div className="checkout__form">
            <div className="checkout__kicker">Seus dados</div>

            <label className="field-label" htmlFor="pedido-nome">
              Nome ou vulgo
            </label>
            <input
              id="pedido-nome"
              className={`field-input${errors.name ? " field-input--error" : ""}`}
              placeholder="ex.: Camarada Rosa"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <div className="field-error">{errors.name}</div>}

            <label className="field-label" htmlFor="pedido-contato">
              Contato (WhatsApp ou e-mail)
            </label>
            <input
              id="pedido-contato"
              className={`field-input${errors.contact ? " field-input--error" : ""}`}
              placeholder="(11) 9 0000-0000"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
            {errors.contact && (
              <div className="field-error">{errors.contact}</div>
            )}

            <p className="checkout__privacy">
              Usamos o contato só para combinar entrega/retirada. Sem cadastro.
            </p>

            {apiError && (
              <div className="alert alert--error">
                Não foi possível enviar o pedido. Tente de novo.
              </div>
            )}

            <button
              className="btn btn--primary btn--block"
              disabled={sending}
              onClick={() => void submit()}
            >
              {sending ? "Enviando…" : "Enviar pedido"}
            </button>
          </div>

          <div className="checkout__summary">
            <div className="checkout__kicker">Resumo</div>
            {items.map((item) => (
              <div key={item.book_id} className="checkout__summary-row">
                <div>
                  {item.title}{" "}
                  <span className="checkout__summary-qty">×{item.amount}</span>
                </div>
                <div className="checkout__summary-line">
                  {formatPrice(item.amount * item.price)}
                </div>
              </div>
            ))}
            <div className="checkout__total">
              <span>Total</span>
              <span className="checkout__total-value">
                {formatPrice(total)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
