import { Link } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { RegionPicker } from './RegionPicker';

export function Header() {
  const { count } = useCart();

  return (
    <header className={`site-header${count > 0 ? ' site-header--sticky' : ''}`}>
      <RegionPicker />
      <div className="site-header__right">
        <Link to="/" className="site-header__brand">
          Livraria Local
        </Link>
        <Link to="/carrinho" className="cart-button">
          <span>Carrinho</span>
          {count > 0 && <span className="cart-button__count">{count}</span>}
        </Link>
      </div>
    </header>
  );
}
