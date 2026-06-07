import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { ChevronDown, ChevronUp, MessageSquare, Search, X, FileSpreadsheet, ArrowUpDown } from 'lucide-react';

type SortField = 'time' | 'content' | 'type' | 'page' | 'color' | 'by';
type SortOrder = 'desc' | 'asc';

export default function AnnotationSummary() {
  const { annotations, measurements, annotationSummaryOpen, toggleAnnotationSummary, setCurrentPage, setSelectedAnnotationId, updateAnnotation, currentDocument } = useStore();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const allItems = useMemo(
    () => {
      const filtered = annotations.filter((a) => a.type === 'text' || a.createdBy !== '');
      return filtered.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case 'time':
            comparison = a.createdAt - b.createdAt;
            break;
          case 'content': {
            const ma = measurements.find((me) => me.annotationId === a.id);
            const mb = measurements.find((me) => me.annotationId === b.id);
            const contentA = a.text || (ma ? `${ma.value.toFixed(2)} ${ma.unit}` : a.type);
            const contentB = b.text || (mb ? `${mb.value.toFixed(2)} ${mb.unit}` : b.type);
            comparison = contentA.localeCompare(contentB);
            break;
          }
          case 'type':
            comparison = a.type.localeCompare(b.type);
            break;
          case 'page':
            comparison = a.pageIndex - b.pageIndex;
            break;
          case 'color': {
            const colorA = a.style?.stroke || '#000000';
            const colorB = b.style?.stroke || '#000000';
            comparison = colorA.localeCompare(colorB);
            break;
          }
          case 'by':
            comparison = (a.createdBy || '').localeCompare(b.createdBy || '');
            break;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    },
    [annotations, measurements, sortBy, sortOrder]
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((ann) => {
      const m = measurements.find((me) => me.annotationId === ann.id);
      const content = ann.text || (m ? `${m.value.toFixed(2)} ${m.unit}` : '');
      const by = ann.createdBy === 'local' ? 'you' : (ann.createdBy || '');
      const color = (ann.style?.stroke || '') + ' ' + (ann.style?.fill || '');
      return (
        ann.type.toLowerCase().includes(q) ||
        content.toLowerCase().includes(q) ||
        by.toLowerCase().includes(q) ||
        color.toLowerCase().includes(q) ||
        String(ann.pageIndex + 1).includes(q)
      );
    });
  }, [allItems, measurements, query]);

  const exportCsv = () => {
    const rows = [['Type', 'Page', 'By', 'Content', 'Value', 'Unit', 'Date']];
    for (const ann of allItems) {
      const m = measurements.find((me) => me.annotationId === ann.id);
      let content = ann.text || ann.type.replace(/-/g, ' ');
      
      // If this is a plan review annotation with new fields, include them
      if ((ann as any).engineering_justification || (ann as any).cad_directive) {
        content = `${content}\n\nJUSTIFICATION: ${(ann as any).engineering_justification || 'N/A'}\n\nDIRECTIVE: ${(ann as any).cad_directive || 'N/A'}`;
      }
      
      const value = m ? m.value.toFixed(2) : '';
      const unit = m ? m.unit : '';
      const date = new Date(ann.createdAt).toLocaleString();
      rows.push([ann.type.replace(/-/g, ' '), String(ann.pageIndex + 1), ann.createdBy === 'local' ? 'You' : ann.createdBy, content, value, unit, date]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDocument?.name || 'annotations'}_summary.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`bg-bb-sidebar border-t border-bb-border transition-all ${annotationSummaryOpen ? 'h-56' : 'h-8'}`} data-tour="annotation-summary">
      <div className="w-full h-8 px-3 flex items-center gap-2">
        <button
          onClick={toggleAnnotationSummary}
          className="flex items-center gap-2 text-xs font-semibold text-bb-muted hover:text-bb-text transition-colors"
        >
          <MessageSquare size={13} />
          <span>Annotation Summary ({items.length}{query ? `/${allItems.length}` : ''})</span>
        </button>
        {annotationSummaryOpen && (
          <div className="ml-3 flex items-center gap-2">
            {/* Search bar */}
            <div className="flex items-center gap-1 bg-bb-dark border border-bb-border rounded px-2 h-6 w-48">
              <Search size={11} className="text-bb-muted shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Search…"
                className="flex-1 bg-transparent outline-none text-[11px] text-bb-text placeholder:text-bb-muted min-w-0"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-bb-muted hover:text-bb-text"
                  title="Clear"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
                className="flex items-center gap-1 px-2 py-1 bg-bb-dark border border-bb-border rounded text-[11px] text-bb-text hover:bg-bb-hover transition-colors"
                title="Sort annotations"
              >
                <ArrowUpDown size={11} className="text-bb-muted" />
                <span className="capitalize">{sortBy}</span>
                <ChevronDown size={10} className={`text-bb-muted transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
              </button>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute z-[110] top-full left-0 mt-1 bg-bb-sidebar border border-bb-border rounded-lg shadow-xl py-1 min-w-[140px]">
                    {(['time', 'content', 'type', 'page', 'color', 'by'] as SortField[]).map((field) => (
                      <button
                        key={field}
                        onClick={(e) => { e.stopPropagation(); setSortBy(field); setShowSortMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-bb-hover transition-colors ${sortBy === field ? 'text-orange-400 font-medium' : 'text-bb-text'}`}
                      >
                        {field === 'by' ? 'Created By' : field.charAt(0).toUpperCase() + field.slice(1)}
                      </button>
                    ))}
                    <div className="border-t border-bb-border my-1" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); setShowSortMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-bb-hover transition-colors text-bb-text"
                    >
                      {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Export CSV button */}
            <button
              onClick={exportCsv}
              disabled={allItems.length === 0}
              className="flex items-center gap-1 px-2 py-1 bg-bb-dark border border-bb-border rounded text-[11px] text-bb-muted hover:text-bb-text hover:bg-bb-hover transition-colors disabled:opacity-30"
              title="Export as CSV"
              data-tour="export-csv"
            >
              <FileSpreadsheet size={11} />
              Export
            </button>
          </div>
        )}
        <span className="flex-1" />
        <button
          onClick={toggleAnnotationSummary}
          className="text-bb-muted hover:text-bb-text transition-colors"
          title={annotationSummaryOpen ? 'Collapse' : 'Expand'}
        >
          {annotationSummaryOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>
      {annotationSummaryOpen && (
        <div className="overflow-y-auto h-48 px-2 pb-2">
          {items.length === 0 ? (
            <div className="text-xs text-bb-muted text-center py-4">
              {allItems.length === 0 ? 'No annotations yet' : 'No annotations match your search'}
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-bb-muted border-b border-bb-border">
                  <th className="text-left py-1 px-1 font-medium cursor-pointer hover:text-bb-text" onClick={() => { if (sortBy === 'type') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else setSortBy('type'); }}>Type {sortBy === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th className="text-left py-1 px-1 font-medium cursor-pointer hover:text-bb-text" onClick={() => { if (sortBy === 'page') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else setSortBy('page'); }}>Page {sortBy === 'page' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th className="text-left py-1 px-1 font-medium cursor-pointer hover:text-bb-text" onClick={() => { if (sortBy === 'color') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else setSortBy('color'); }}>Color {sortBy === 'color' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th className="text-left py-1 px-1 font-medium cursor-pointer hover:text-bb-text" onClick={() => { if (sortBy === 'by') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else setSortBy('by'); }}>By {sortBy === 'by' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th className="text-left py-1 px-1 font-medium cursor-pointer hover:text-bb-text" onClick={() => { if (sortBy === 'content') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else setSortBy('content'); }}>Content {sortBy === 'content' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th className="text-left py-1 px-1 font-medium cursor-pointer hover:text-bb-text" onClick={() => { if (sortBy === 'time') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else setSortBy('time'); }}>Date {sortBy === 'time' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ann) => {
                  const m = measurements.find((me) => me.annotationId === ann.id);
                  const content = ann.text || (m ? `${m.value.toFixed(2)} ${m.unit}` : ann.type);
                  const stroke = ann.style?.stroke || '#000000';
                  return (
                    <tr
                      key={ann.id}
                      onClick={() => { setCurrentPage(ann.pageIndex); setSelectedAnnotationId(ann.id); }}
                      className="hover:bg-bb-hover cursor-pointer border-b border-bb-border/30"
                    >
                      <td className="py-1 px-1 capitalize">{ann.type.replace(/-/g, ' ')}</td>
                      <td className="py-1 px-1">{ann.pageIndex + 1}</td>
                      <td className="py-1 px-1" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center gap-1.5 cursor-pointer" title={stroke}>
                          <span
                            className="inline-block w-4 h-4 rounded border border-bb-border shrink-0"
                            style={{ backgroundColor: stroke }}
                          />
                          <input
                            type="color"
                            value={normalizeHex(stroke)}
                            onChange={(e) => {
                              const next = e.target.value;
                              updateAnnotation(ann.id, {
                                style: { ...ann.style, stroke: next },
                              });
                            }}
                            className="w-0 h-0 opacity-0 absolute pointer-events-none"
                            aria-hidden
                          />
                          <span className="text-[10px] text-bb-muted uppercase">
                            {normalizeHex(stroke)}
                          </span>
                        </label>
                      </td>
                      <td className="py-1 px-1 text-bb-muted">{ann.createdBy === 'local' ? 'You' : ann.createdBy}</td>
                      <td className="py-1 px-1 truncate max-w-[150px]">{content}</td>
                      <td className="py-1 px-1 text-bb-muted">{new Date(ann.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// Convert an arbitrary CSS color to a #RRGGBB string for <input type="color">.
// Falls back to black when parsing fails.
function normalizeHex(color: string): string {
  if (!color) return '#000000';
  const c = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return ('#' + c.slice(1).split('').map((ch) => ch + ch).join('')).toLowerCase();
  }
  // rgb(r,g,b) or rgba(...)
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n))) {
      const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      return ('#' + toHex(parts[0]) + toHex(parts[1]) + toHex(parts[2])).toLowerCase();
    }
  }
  return '#000000';
}
