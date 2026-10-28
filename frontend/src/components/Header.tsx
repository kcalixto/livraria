import { Link } from "react-router-dom";
import { useIsMobile } from "../backoffice/useIsMobile";
import { useCart } from "../cart/CartContext";
import { ActionGlyph } from "./ActionIcon";
import { RegionPicker } from "./RegionPicker";

export function Header() {
  const { count } = useCart();
  const isMobile = useIsMobile();

  return (
    <header className={`site-header${count > 0 ? " site-header--sticky" : ""}`}>
      <RegionPicker />
      <div className="site-header__right">
        <Link to="/" className="site-header__brand">
          Edições Manoel Lisboa
        </Link>
        <Link to="/pedido" className="site-header__consulta">
          consultar pedido
        </Link>
        <Link to="/carrinho" className="cart-button">
          <ActionGlyph icon="cart" />
          {!isMobile && <span>Carrinho</span>}
          {count > 0 && <span className="cart-button__count">{count}</span>}
        </Link>
      </div>
    </header>
  );
}
