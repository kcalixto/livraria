import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiPost } from '../../api/client';
import { setToken } from '../../backoffice/auth';

interface LoginState {
  expired?: boolean;
  from?: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LoginState;
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setChecking(true);
    setError(false);
    try {
      const { token } = await apiPost<{ token: string }>('/backoffice/login', { password });
      setToken(token);
      // volta pra onde o operador estava quando a sessão caiu
      navigate(state.from ?? '/backoffice/pedidos');
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="bo-login">
      <form className="bo-login__card" onSubmit={(e) => void submit(e)}>
        <div className="bo-login__brand">Livraria Local</div>
        <div className="bo-login__sub">Acesso restrito</div>

        {state.expired && (
          <div className="alert alert--warn bo-login__expired">
            Sessão expirada — entre de novo.
          </div>
        )}

        <label className="field-label" htmlFor="bo-senha">
          Senha
        </label>
        <input
          id="bo-senha"
          type="password"
          autoFocus
          autoComplete="current-password"
          className={`field-input bo-login__input${error ? ' field-input--error' : ''}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <div className="field-error" role="alert">
            Senha incorreta. Tente novamente.
          </div>
        )}

        <button className="btn btn--primary btn--block" type="submit" disabled={checking}>
          {checking ? (
            <>
              <span className="spinner" /> Verificando
            </>
          ) : (
            'Entrar'
          )}
        </button>
      </form>
    </div>
  );
}
