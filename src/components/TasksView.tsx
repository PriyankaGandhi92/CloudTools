import React, { useState } from 'react';
import { Download, Edit, Image as ImageIcon } from 'lucide-react';
import type { Annotation } from '../types';
import { useStore } from '../store/useStore';
import PhotoAnalyzerDialog from './PhotoAnalyzerDialog';

interface TasksViewProps {
  tasks: Annotation[];
  filteredTasks: Annotation[];
  uniqueAssignees: string[];
  taskAssigneeFilter: string;
  setTaskAssigneeFilter: (value: string) => void;
  uniqueCategories: string[];
  taskCategoryFilter: string;
  setTaskCategoryFilter: (value: string) => void;
  taskStatusCounts: { counts: Record<string, number>; total: number };
}

export default function TasksView({
  tasks,
  filteredTasks,
  uniqueAssignees,
  taskAssigneeFilter,
  setTaskAssigneeFilter,
  uniqueCategories,
  taskCategoryFilter,
  setTaskCategoryFilter,
  taskStatusCounts,
}: TasksViewProps) {
  const statusColors = { 'Open': 'text-red-400', 'In Progress': 'text-yellow-400', 'Complete': 'text-blue-400', 'Verified': 'text-green-400' };
  const { counts, total } = taskStatusCounts;
  const [analyzerImage, setAnalyzerImage] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-bb-muted uppercase tracking-wider">Project Tasks</h3>

        <div className="flex gap-2">
          <span className="text-xs bg-bb-blue/20 text-bb-blue px-2 py-0.5 rounded-full">{filteredTasks.length} / {tasks.length}</span>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-export-dialog'))}
            className="text-[10px] flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded transition-colors"
          >
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-bb-muted uppercase tracking-wider font-semibold w-16">Assignee:</span>
            <select
              value={taskAssigneeFilter}
              onChange={(e) => setTaskAssigneeFilter(e.target.value)}
              className="flex-1 bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
            >
              <option value="All">All Users</option>
              {uniqueAssignees.map(assignee => (
                <option key={assignee} value={assignee}>{assignee}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-bb-muted uppercase tracking-wider font-semibold w-16">Category:</span>
            <select
              value={taskCategoryFilter}
              onChange={(e) => setTaskCategoryFilter(e.target.value)}
              className="flex-1 bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
            >
              <option value="All">All Categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {filteredTasks.length > 0 && (
        <div className="mb-4 bg-bb-panel border border-bb-border rounded p-3">
          <div className="flex justify-between items-end mb-2">
            <span className="text-[10px] uppercase tracking-wider text-bb-muted font-bold">Project Health</span>
            <span className="text-xs font-bold text-bb-text">{Math.round((counts['Verified'] / total) * 100)}% Verified</span>
          </div>

          <div className="h-2 w-full flex rounded-full overflow-hidden mb-2 bg-black">
            <div style={{ width: `${(counts['Verified'] / total) * 100}%` }} className="bg-green-500 h-full" />
            <div style={{ width: `${(counts['Complete'] / total) * 100}%` }} className="bg-blue-500 h-full" />
            <div style={{ width: `${(counts['In Progress'] / total) * 100}%` }} className="bg-yellow-500 h-full" />
            <div style={{ width: `${(counts['Open'] / total) * 100}%` }} className="bg-red-500 h-full" />
          </div>

          <div className="flex justify-between text-[9px] text-bb-muted font-medium">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> V: {counts['Verified']}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> C: {counts['Complete']}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> IP: {counts['In Progress']}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> O: {counts['Open']}</span>
          </div>
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <div className="text-xs text-bb-muted text-center py-8">
          {tasks.length === 0 ? 'No tasks recorded.' : 'No tasks for this assignee.'}
        </div>
      ) : (
        filteredTasks.map(task => {
          const content = task.pinContent || {};

          return (
            <div
              key={task.id}
              onClick={() => {
                useStore.getState().setCurrentPage(task.pageIndex);
                window.dispatchEvent(new CustomEvent('edit-task', { detail: task.id }));
              }}
              className="bg-[#1e1e1e] border border-bb-border rounded p-3 cursor-pointer hover:border-bb-blue transition-colors group relative"
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-bb-blue">
                <Edit size={14} />
              </div>

              <div className="flex justify-between items-start mb-2 pr-4">
                <h4 className="text-sm text-bb-text font-medium group-hover:text-bb-blue transition-colors">
                  {content.name || 'Untitled Task'}
                </h4>
                <span className={`text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-semibold ${statusColors[content.status as keyof typeof statusColors || 'Open']}`}>
                  {content.status || 'Open'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] text-bb-muted mb-2">
                <span className="bg-bb-dark px-1.5 py-0.5 rounded">Page {task.pageIndex + 1}</span>
                {content.priority === 'High' && <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1">⚠️ High Risk</span>}
                {content.assignee && <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">@{content.assignee}</span>}
                {content.category && <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">{content.category}</span>}
              </div>

              {/* Image thumbnails */}
              {content.images && content.images.length > 0 && (
                <div className="flex gap-2 mb-2">
                  {content.images.map((img, idx) => (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnalyzerImage(img);
                      }}
                      className="relative w-12 h-12 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-bb-blue transition-all group"
                    >
                      <img src={img} alt="Task photo" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <ImageIcon size={14} className="text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {content.text && <p className="text-xs text-bb-muted line-clamp-2">{content.text}</p>}
            </div>
          );
        })
      )}

      {/* Photo Analyzer Dialog */}
      {analyzerImage && (
        <PhotoAnalyzerDialog
          imageUrl={analyzerImage}
          onClose={() => setAnalyzerImage(null)}
        />
      )}
    </div>
  );
}
