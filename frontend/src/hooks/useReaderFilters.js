import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readerQuery, readReaderQuery } from '../utils/reader-query.js';

export function useReaderFilters() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const parsed = useMemo(() => readReaderQuery(new URLSearchParams(key)), [key]);
  return { ...parsed, key,
    update: (changes) => setParams(readerQuery({ ...parsed.filters, ...changes, page: 1 }), { flushSync: true }),
    goPage: (page, options) => setParams(readerQuery({ ...parsed.filters, page }), options),
    changeSize: (pageSize) => setParams(readerQuery({ ...parsed.filters, page: 1, pageSize })),
    reset: () => setParams(new URLSearchParams()),
  };
}
