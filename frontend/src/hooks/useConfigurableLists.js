import { useAuth } from '../context/AuthContext';
import { loadSharedDocument, saveSharedDocument, SHARED_DOCUMENT_KEYS } from '../services/sharedDocuments';
import {
  appendConfigurableOption,
  canManageConfigurableLists,
  getConfigurableListOptions,
  normalizeConfigurableLists,
} from '../utils/configurableLists';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = SHARED_DOCUMENT_KEYS.configurableLists;

export default function useConfigurableLists() {
  const { user } = useAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const loaded = await loadSharedDocument(STORAGE_KEY, []);
      if (!active) return;
      setLists(normalizeConfigurableLists(loaded));
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const persistLists = useCallback(async (nextLists) => {
    const normalized = normalizeConfigurableLists(nextLists);
    setSaving(true);
    try {
      await saveSharedDocument(STORAGE_KEY, normalized);
      setLists(normalized);
      setError('');
      return normalized;
    } catch (saveError) {
      console.error('Error guardando listas configurables:', saveError);
      setError('No se pudieron guardar las listas configurables.');
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, []);

  const getOptions = useCallback(
    (key, fallback = []) => getConfigurableListOptions(lists, key, fallback),
    [lists],
  );

  const addOptionQuickly = useCallback(async (key, label = 'valor') => {
    if (!canManageConfigurableLists(user)) return { added: false };
    const typedValue = window.prompt(`Agregar ${label}`, '');
    if (!typedValue) return { added: false };

    const result = appendConfigurableOption(lists, key, typedValue);
    if (!result.value) return { added: false };

    if (result.duplicate) {
      window.alert(`"${result.value}" ya existe en esta lista.`);
      return { added: false, duplicate: true, value: result.value };
    }

    await persistLists(result.nextLists);
    return { added: true, value: result.value };
  }, [lists, persistLists, user]);

  return {
    lists,
    setLists,
    loading,
    saving,
    error,
    setError,
    canManage: canManageConfigurableLists(user),
    getOptions,
    persistLists,
    addOptionQuickly,
  };
}
