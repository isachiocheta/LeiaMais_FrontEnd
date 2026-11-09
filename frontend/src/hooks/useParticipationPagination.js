import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { participationQuery, readParticipationQuery } from '../utils/participation-query.js';

export function useParticipationPagination() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const parsed = useMemo(() => readParticipationQuery(new URLSearchParams(search)), [search]);
  return {
    ...parsed, key: search,
    goPage: (page, options) => setParams(participationQuery({ ...parsed.filters, page }), options),
    changeSize: (pageSize) => setParams(participationQuery({ page: 1, pageSize })),
    reset: () => setParams(new URLSearchParams()),
  };
}
