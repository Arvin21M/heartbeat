import { useEffect, useMemo, useState } from 'react';
import { loadEvents } from './lib/loadEvents';
import { useUrlSet } from './lib/useUrlSet';
import { Timeline } from './components/Timeline';
import { FilterBar } from './components/FilterBar';
import type { Dataset } from './types';

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedFunds, setSelectedFunds, toggleFund] = useUrlSet('funds');
  const [selectedRepos, setSelectedRepos, toggleRepo] = useUrlSet('repos');
  const [selectedTypes, setSelectedTypes, toggleType] = useUrlSet('types');

  useEffect(() => {
    loadEvents()
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, []);

  const fundReposUnion = useMemo(() => {
    if (!data || !selectedFunds || selectedFunds.size === 0) return null;
    const out = new Set<string>();
    for (const f of selectedFunds) for (const r of data.funds[f] ?? []) out.add(r);
    return out;
  }, [data, selectedFunds]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => {
      if (fundReposUnion && !fundReposUnion.has(e.repo)) return false;
      if (selectedRepos && selectedRepos.size > 0 && !selectedRepos.has(e.repo)) return false;
      if (selectedTypes && selectedTypes.size > 0 && !selectedTypes.has(e.type)) return false;
      return true;
    });
  }, [data, fundReposUnion, selectedRepos, selectedTypes]);

  if (error) {
    return (
      <div className="p-6 text-red-400">
        <p>Failed to load events: {error}</p>
        <p className="text-zinc-500 text-sm mt-2">
          Run <code className="text-zinc-300">npm run fetch</code> first to populate{' '}
          <code className="text-zinc-300">public/data/events.json</code>.
        </p>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-zinc-500">loading...</div>;
  }

  const generated = new Date(data.generatedAt);
  const generatedLabel = isNaN(generated.getTime())
    ? 'never'
    : generated.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  return (
    <div className="min-h-full">
      <div className="sm:sticky sm:top-0 z-10">
        <FilterBar
          repos={data.repos}
          funds={data.funds}
          selectedFunds={selectedFunds}
          onToggleFund={toggleFund}
          onClearFunds={() => setSelectedFunds(null)}
          selectedRepos={selectedRepos}
          onToggleRepo={toggleRepo}
          onClearRepos={() => setSelectedRepos(null)}
          selectedTypes={selectedTypes}
          onToggleType={toggleType}
          onClearTypes={() => setSelectedTypes(null)}
          total={data.events.length}
          shown={filtered.length}
        />
      </div>
      <Timeline events={filtered} />
      <footer className="px-3 py-4 text-xs text-zinc-600 border-t border-zinc-900">
        last fetched {generatedLabel} - window {data.windowDays}d - {data.repos.length} repo(s)
      </footer>
    </div>
  );
}
