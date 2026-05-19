import { useEffect, useState } from "react";

export type SavedView = {
  name: string;
  filters: {
    projectId: string | null;
    statusId: string | null;
    priority: string | null;
    search: string;
    includeDone: boolean;
  };
};

const KEY_PREFIX = "tms-saved-views::";

export function useSavedViews(scope: string) {
  const key = KEY_PREFIX + scope;
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setViews(raw ? (JSON.parse(raw) as SavedView[]) : []);
    } catch {
      setViews([]);
    }
  }, [key]);

  function persist(next: SavedView[]) {
    setViews(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function save(view: SavedView) {
    const idx = views.findIndex((v) => v.name === view.name);
    const next = idx >= 0 ? views.map((v, i) => (i === idx ? view : v)) : [...views, view];
    persist(next);
  }

  function remove(name: string) {
    persist(views.filter((v) => v.name !== name));
  }

  return { views, save, remove };
}
