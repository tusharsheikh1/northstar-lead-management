import { useMemo } from 'react';
import { LEAD_SOURCES } from '../types';
import { useStore } from '../store/StoreContext';

export const useSources = () => {
  const { db } = useStore();
  return useMemo(() => [...new Set<string>([...LEAD_SOURCES, ...db.leads.map((l) => l.source)])].sort(), [db.leads]);
};
