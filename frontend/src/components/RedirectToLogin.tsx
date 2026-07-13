import { Navigate, useLocation } from 'react-router-dom';

// Redirect por 401: leva contexto pro Login avisar "sessão expirada" e
// devolver o operador à rota onde estava após o relogin.
export function RedirectToLogin() {
  const location = useLocation();
  return <Navigate to="/backoffice" replace state={{ expired: true, from: location.pathname }} />;
}
