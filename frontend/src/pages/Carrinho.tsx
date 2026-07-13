import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../api/client";
import { useCart } from "../cart/CartContext";
import { formatOrderCode, formatPrice } from "../lib/format";
import { ACTIVE_REGION_VALUE } from "../lib/region";

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
          <Link to="/pedido" className="order-done__track">
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
