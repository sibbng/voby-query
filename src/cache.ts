import { $, type Observable } from 'voby';

export const createCacheState = <T>(cache?: Map<string, T> & { version?: Observable<number> }) => {
  const map = (cache ?? new Map<string, T>()) as Map<string, T> & { version?: Observable<number> };
  const version = map.version ?? $(0);
  const bump = () => version((value) => value + 1);

  map.version = version;

  return { map, version, bump };
};
