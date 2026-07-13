import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { clearToken } from './auth';

export interface ResourceState<T> {
  data: T | null;
  loading: boolean; // só a PRIMEIRA carga (tela vazia)
  refreshing: boolean; // recargas seguintes mantêm os dados na tela
  error: boolean;
  unauthorized: boolean;
}

// Estados de carregamento/erro/401 padronizados pro backoffice inteiro.
// Reloads não "piscam" a tela: os dados anteriores ficam visíveis.
export function useBackofficeResource<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    loading: true,
    refreshing: false,
    error: false,
    unauthorized: false,
  });
  const hasData = useRef(false);

  const load = useCallback(async () => {
    setState((s) => ({
      ...s,
      loading: !hasData.current,
      refreshing: hasData.current,
      error: false,
    }));
    try {
      const data = await fetcher();
      hasData.current = true;
      setState({ data, loading: false, refreshing: false, error: false, unauthorized: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setState((s) => ({ ...s, loading: false, refreshing: false, unauthorized: true }));
        return;
      }
      setState((s) => ({ ...s, loading: false, refreshing: false, error: true }));
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
