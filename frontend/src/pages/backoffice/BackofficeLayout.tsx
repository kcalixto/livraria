import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { getToken } from '../../backoffice/auth';
import { RegionPicker } from '../../components/RegionPicker';

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
        <NavLink to="/backoffice/livros" className="bo-tab">
          Livros
        </NavLink>
        <NavLink to="/backoffice/lotes" className="bo-tab">
          Lotes
        </NavLink>
        <span className="bo-tabs__region">
          <RegionPicker />
        </span>
      </nav>
      <Outlet />
    </div>
  );
}
