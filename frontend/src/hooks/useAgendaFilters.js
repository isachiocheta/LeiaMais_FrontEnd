import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { agendaQuery, readAgendaQuery } from '../utils/agenda-query.js';
export function useAgendaFilters() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const parsed = useMemo(() => readAgendaQuery(new URLSearchParams(key)), [key]);
  return { ...parsed, key,
    goPage: (page, options) => setParams(agendaQuery({ ...parsed.filters, page }), options),
    changeSize: (pageSize) => setParams(agendaQuery({ ...parsed.filters, page: 1, pageSize })),
    changeFuture: (futuros) => setParams(agendaQuery({ ...parsed.filters, page: 1, futuros })),
    reset: () => setParams(new URLSearchParams()),
  };
}
