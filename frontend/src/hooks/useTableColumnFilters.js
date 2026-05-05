import { useEffect, useState } from 'react';
import { buildInitialTableFilters, hasActiveTableFilters, syncTableFilters } from '../utils/tableFilters';

export default function useTableColumnFilters(columns = []) {
  const [filters, setFilters] = useState(() => buildInitialTableFilters(columns));

  useEffect(() => {
    setFilters((current) => syncTableFilters(columns, current));
  }, [columns]);

  const setFilter = (columnId, value) => {
    setFilters((current) => ({
      ...current,
      [columnId]: value,
    }));
  };

  const clearFilters = () => {
    setFilters(buildInitialTableFilters(columns));
  };

  return {
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters: hasActiveTableFilters(filters),
  };
}
