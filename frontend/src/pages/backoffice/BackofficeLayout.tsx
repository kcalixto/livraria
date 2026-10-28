import { useEffect, useState } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  canWrite,
  clearToken,
  getToken,
  tokenExpiresAt,
  tokenRole,
  type Role,
} from "../../backoffice/auth";
import { RegionPicker } from "../../components/RegionPicker";

const WARN_BELOW_MINUTES = 10;

function minutesLeft(): number | null {
  const exp = tokenExpiresAt();
  if (exp === null) return null;
  return Math.max(0, Math.ceil((exp - Date.now() / 1000) / 60));
}

export function BackofficeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionMinutes, setSessionMinutes] = useState<number | null>(
    minutesLeft(),
  );

  useEffect(() => {
    const timer = setInterval(() => setSessionMinutes(minutesLeft()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!getToken()) return <Navigate to="/backoffice" replace />;

  const role = tokenRole();
  if (role === null) return <Navigate to="/backoffice" replace />;

  const stockOnly = role === "stock";
  const path = location.pathname;

  // guards de rota (cosméticos — a API nega de qualquer forma):
  // stock fora de Estoque/Livros, e perfis de leitura em rotas de form
  const atStockAllowedPath =
    path.startsWith("/backoffice/estoque") ||
    path.startsWith("/backoffice/livros");
  if (stockOnly && !atStockAllowedPath) {
    return <Navigate to="/backoffice/estoque" replace />;
  }
  const isFormRoute = /\/(novo|editar)$/.test(path);
  if (!canWrite() && isFormRoute) {
    return (
      <Navigate
        to={stockOnly ? "/backoffice/estoque" : "/backoffice/pedidos"}
        replace
      />
    );
  }

  function logout() {
    clearToken();
    navigate("/backoffice");
  }

  const paths: {
    to: string;
    title: string;
    dividerRight: boolean;
    roles: { [K in Role]: boolean };
  }[] = [
    {
      to: "/backoffice/pedidos",
      title: "Pedidos",
      dividerRight: false,
      roles: {
        admin: true,
        viewer: true,
        stock: false,
        "reading-manager": false,
      },
    },
    {
      to: "/backoffice/vendas",
      title: "Vendas",
      dividerRight: true,
      roles: {
        admin: true,
        viewer: true,
        stock: false,
        "reading-manager": false,
      },
    },
    {
      to: "/backoffice/estoque",
      title: "Estoque",
      dividerRight: false,
      roles: {
        admin: true,
        viewer: true,
        stock: true,
        "reading-manager": false,
      },
    },
    {
      to: "/backoffice/lotes",
      title: "Lotes",
      dividerRight: false,
      roles: {
        admin: true,
        viewer: true,
        stock: false,
        "reading-manager": false,
      },
    },
    {
      to: "/backoffice/livros",
      title: "Livros",
      dividerRight: false,
      roles: {
        admin: true,
        viewer: true,
        stock: true,
        "reading-manager": false,
      },
    },
    {
      to: "/backoffice/leitura",
      title: "Leituras",
      dividerRight: false,
      roles: {
        admin: true,
        viewer: false,
        stock: false,
        "reading-manager": true,
      },
    },
  ];

  return (
    <div className="page page--wide">
      <nav className="bo-tabs">
        {paths.map((p, i) => {
          if (!p.roles[role]) return;
          return (
            <>
              <NavLink to={p.to} className="bo-tab" id={`${i}`}>
                {p.title}
              </NavLink>
              {p.dividerRight && (
                <span className="bo-tabs__divider" aria-hidden="true" />
              )}
            </>
          );
        })}

        {/**/}
        <span className="bo-tabs__region">
          <RegionPicker />
        </span>
        {sessionMinutes !== null && sessionMinutes < WARN_BELOW_MINUTES && (
          <span className="session-warning">
            Sessão expira em {sessionMinutes}min
          </span>
        )}
        <button className="logout-btn" onClick={logout}>
          Sair
        </button>
      </nav>
      <Outlet />
    </div>
  );
}
