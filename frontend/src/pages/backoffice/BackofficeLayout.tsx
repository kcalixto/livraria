import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { canWrite, clearToken, getToken, tokenExpiresAt, tokenRole } from '../../backoffice/auth';
import { RegionPicker } from '../../components/RegionPicker';

const WARN_BELOW_MINUTES = 10;

function minutesLeft(): number | null {
  const exp = tokenExpiresAt();
  if (exp === null) return null;
  return Math.max(0, Math.ceil((exp - Date.now() / 1000) / 60));
}

export function BackofficeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionMinutes, setSessionMinutes] = useState<number | null>(minutesLeft());

  useEffect(() => {
    const timer = setInterval(() => setSessionMinutes(minutesLeft()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!getToken()) return <Navigate to="/backoffice" replace />;

  const role = tokenRole();
  const stockOnly = role === 'stock';
  const path = location.pathname;

  // guards de rota (cosméticos — a API nega de qualquer forma):
  // stock fora de Estoque/Livros, e perfis de leitura em rotas de form
  const stockAllowed =
    path.startsWith('/backoffice/estoque') || path.startsWith('/backoffice/livros');
  if (stockOnly && !stockAllowed) {
    return <Navigate to="/backoffice/estoque" replace />;
  }
  const isFormRoute = /\/(novo|editar)$/.test(path);
  if (!canWrite() && isFormRoute) {
    return <Navigate to={stockOnly ? '/backoffice/estoque' : '/backoffice/pedidos'} replace />;
  }

  function logout() {
    clearToken();
    navigate('/backoffice');
  }

  return (
    <div className="page page--wide">
      <nav className="bo-tabs">
        {/* operação diária | gestão de acervo */}
        {!stockOnly && (
          <>
            <NavLink to="/backoffice/pedidos" className="bo-tab">
              Pedidos
            </NavLink>
            <NavLink to="/backoffice/vendas" className="bo-tab">
              Vendas
            </NavLink>
            <span className="bo-tabs__divider" aria-hidden="true" />
          </>
        )}
        <NavLink to="/backoffice/estoque" className="bo-tab">
          Estoque
        </NavLink>
        {!stockOnly && (
          <NavLink to="/backoffice/lotes" className="bo-tab">
            Lotes
          </NavLink>
        )}
        <NavLink to="/backoffice/livros" className="bo-tab">
          Livros
        </NavLink>
        <span className="bo-tabs__region">
          <RegionPicker />
        </span>
        {sessionMinutes !== null && sessionMinutes < WARN_BELOW_MINUTES && (
          <span className="session-warning">Sessão expira em {sessionMinutes}min</span>
        )}
        <button className="logout-btn" onClick={logout}>
          Sair
        </button>
      </nav>
      <Outlet />
    </div>
  );
}
