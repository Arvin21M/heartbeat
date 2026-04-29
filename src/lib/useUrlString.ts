import { useCallback, useEffect, useState } from 'react';

function readParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? '';
}

function writeParam(key: string, value: string): void {
  const url = new URL(window.location.href);
  if (value === '') {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }
  window.history.replaceState({}, '', url);
}

/**
 * URL-backed string state. Empty string means "param absent", matching
 * the convention used by useUrlSet for chip filters.
 */
export function useUrlString(key: string): [string, (next: string) => void] {
  const [value, setValue] = useState<string>(() => readParam(key));

  useEffect(() => {
    const onPop = () => setValue(readParam(key));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [key]);

  const set = useCallback(
    (next: string) => {
      writeParam(key, next);
      setValue(next);
    },
    [key],
  );

  return [value, set];
}
