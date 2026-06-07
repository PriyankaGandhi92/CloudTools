import React, { useState, useEffect } from 'react';
import { Plus, FolderOpen, Trash2, Edit2, ChevronRight, Clock, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { createProject, getProjects, updateProject, deleteProject } from '../utils/projectManager';
import type { Project } from '../types/project';

interface ProjectManagerProps {
  onSelectProject?: (project: Project) => void;
  onClose?: () => void;
}

export default function ProjectManager({ onSelectProject, onClose }: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    
    try {
      await createProject(newProjectName, newProjectDescription);
      setNewProjectName('');
      setNewProjectDescription('');
      setShowCreateDialog(false);
      loadProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !newProjectName.trim()) return;
    
    try {
      await updateProject(editingProject.id, { name: newProjectName, description: newProjectDescription });
      setEditingProject(null);
      setNewProjectName('');
      setNewProjectDescription('');
      loadProjects();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This will delete all annotations and PDF versions.')) return;
    
    try {
      await deleteProject(projectId);
      loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setNewProjectName(project.name);
    setNewProjectDescription(project.description || '');
  };

  const getOpenAnnotationsCount = (project: Project) => {
    return project.annotations.filter(a => a.status === 'open' || a.status === 'still_not_fixed').length;
  };

  const getResolvedAnnotationsCount = (project: Project) => {
    return project.annotations.filter(a => a.status === 'resolved').length;
  };

  return (
    <div className="bg-bb-dark border border-bb-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-bb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-orange-400" />
          <h2 className="text-sm font-semibold text-bb-text">Projects</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded transition-colors"
          >
            <Plus size={12} />
            New Project
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-bb-muted hover:text-bb-text transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Projects List */}
      {loading ? (
        <div className="p-8 text-center text-bb-muted text-xs">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="p-8 text-center">
          <FolderOpen size={32} className="mx-auto text-bb-muted mb-3" />
          <p className="text-sm text-bb-muted mb-4">No projects yet</p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-3 py-1.5 text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded transition-colors"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {projects.map((project) => (
            <div
              key={project.id}
              className="px-4 py-3 border-b border-bb-border hover:bg-bb-hover/50 transition-colors cursor-pointer"
              onClick={() => onSelectProject?.(project)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-bb-text">{project.name}</h3>
                    {project.currentPdfId && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Active</span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-xs text-bb-muted mb-2">{project.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-[10px] text-bb-muted">
                    <div className="flex items-center gap-1">
                      <FileText size={10} />
                      <span>{project.pdfVersions.length} PDF version(s)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertTriangle size={10} className="text-orange-400" />
                      <span>{getOpenAnnotationsCount(project)} open</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle size={10} className="text-green-400" />
                      <span>{getResolvedAnnotationsCount(project)} resolved</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={10} />
                      <span>
                        Updated {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditProject(project);
                    }}
                    className="p-1 text-bb-muted hover:text-bb-text transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                    className="p-1 text-bb-muted hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                  <ChevronRight size={12} className="text-bb-muted ml-1" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(showCreateDialog || editingProject) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bb-panel border border-bb-border rounded-lg p-4 w-96 max-w-full">
            <h3 className="text-sm font-semibold text-bb-text mb-3">
              {editingProject ? 'Edit Project' : 'Create New Project'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-bb-muted block mb-1">Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-bb-dark border border-bb-border focus:border-orange-500 rounded px-3 py-2 text-xs text-bb-text outline-none"
                  placeholder="Enter project name"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] text-bb-muted block mb-1">Description (Optional)</label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full bg-bb-dark border border-bb-border focus:border-orange-500 rounded px-3 py-2 text-xs text-bb-text outline-none resize-none"
                  rows={3}
                  placeholder="Enter project description"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowCreateDialog(false);
                    setEditingProject(null);
                    setNewProjectName('');
                    setNewProjectDescription('');
                  }}
                  className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border text-bb-text rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingProject ? handleUpdateProject : handleCreateProject}
                  className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors"
                >
                  {editingProject ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
