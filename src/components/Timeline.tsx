import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Event } from '../types';
import { EventRow } from './EventRow';

type Props = {
  events: Event[];
  onSelectRepo?: (repo: string) => void;
  onSelectActor?: (actor: string) => void;
};

type FlatItem =
  | { kind: 'header'; day: string; count: number }
  | { kind: 'event'; event: Event };

function flatten(events: Event[]): FlatItem[] {
  const out: FlatItem[] = [];
  let currentDay = '';
  let headerIdx = -1;
  for (const e of events) {
    const day = e.timestamp.slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      headerIdx = out.length;
      out.push({ kind: 'header', day, count: 0 });
    }
    out.push({ kind: 'event', event: e });
    const header = out[headerIdx];
    if (header.kind === 'header') header.count++;
  }
  return out;
}

export function Timeline({ events, onSelectRepo, onSelectActor }: Props) {
  const items = useMemo(() => flatten(events), [events]);

  const parentRef = useRef<HTMLDivElement>(null);
  const [parentOffset, setParentOffset] = useState(0);

  useLayoutEffect(() => {
    if (parentRef.current) setParentOffset(parentRef.current.offsetTop);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (index) => (items[index]?.kind === 'header' ? 28 : 24),
    overscan: 20,
    scrollMargin: parentOffset,
    getItemKey: (index) => {
      const item = items[index];
      if (!item) return index;
      return item.kind === 'header' ? `h:${item.day}` : `e:${item.event.id}`;
    },
  });

  if (events.length === 0) {
    return <div className="text-zinc-500 px-2 py-8">No events match the current filters.</div>;
  }

  return (
    <div ref={parentRef} className="pb-12">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - parentOffset}px)`,
              }}
            >
              {item.kind === 'header' ? (
                <div className="bg-zinc-950/95 backdrop-blur px-2 py-1 text-zinc-500 text-xs border-b border-zinc-900">
                  {`---- ${item.day} ----`}
                  <span className="ml-2 text-zinc-700">{item.count}</span>
                </div>
              ) : (
                <EventRow
                  event={item.event}
                  onSelectRepo={onSelectRepo}
                  onSelectActor={onSelectActor}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
