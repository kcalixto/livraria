import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { getToken } from '../../backoffice/auth';

export function BackofficeLayout() {
  if (!getToken()) return <Navigate to="/backoffice" replace />;

  return (
    <div className="page page--wide">
      <nav className="bo-tabs">
        <NavLink to="/backoffice/pedidos" className="bo-tab">
          Pedidos
        </NavLink>
        <NavLink to="/backoffice/vendas" className="bo-tab">
          Vendas
        </NavLink>
        <NavLink to="/backoffice/estoque" className="bo-tab">
          Estoque
        </NavLink>
        <span className="bo-tabs__hint">Status por livro · finalize itens independentes</span>
      </nav>
      <Outlet />
    </div>
  );
}
