import { useMemo } from 'react';
import { useStore } from '../store/StoreContext';
import { makeFormatter } from '../lib/format';

export const useFormat = () => {
  const { workspace } = useStore().db.settings;
  return useMemo(() => makeFormatter(workspace), [workspace]);
};
