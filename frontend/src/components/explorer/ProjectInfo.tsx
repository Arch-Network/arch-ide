import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { projectService } from '../../services/projectService';
import type { Project } from '../../types';

interface ProjectInfoProps {
  project: Project | null;
  onProjectUpdate: (project: Project) => void;
}

const ProjectInfo: React.FC<ProjectInfoProps> = ({ project, onProjectUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(project?.name || '');
  const [editedDescription, setEditedDescription] = useState(project?.description || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditedName(project?.name || '');
    setEditedDescription(project?.description || '');
  }, [project]);

  const handleSave = async () => {
    if (!project) return;

    const updatedProject = {
      ...project,
      name: editedName,
      description: editedDescription,
      lastModified: new Date(),
    };

    await projectService.saveProject(updatedProject);
    onProjectUpdate(updatedProject);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedName(project?.name || '');
    setEditedDescription(project?.description || '');
    setIsEditing(false);
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing, editedDescription]);

  const getPreviewText = (text: string) => {
    const lines = text.split('\n').slice(0, 1);
    const preview = lines.join('\n');
    return preview + (text.split('\n').length > 1 ? '...' : '');
  };

  return (
    <div className="border-b border-gray-700/60">
      <div
        className="flex items-center px-3 py-2 cursor-pointer hover:bg-gray-700/40 group transition-colors duration-150"
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-gray-500 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-500 shrink-0" />
        )}
        <span className="ml-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Project Info
        </span>
        {!isEditing && isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-gray-600/50 p-1 rounded-md transition-all duration-150"
          >
            <Pencil size={12} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* Collapsed preview */}
      {!isExpanded && (
        <div className="px-4 pb-2 text-xs text-gray-500">
          {project?.name || 'Loading...'}
          {project?.description && (
            <span className="text-gray-600"> -- {getPreviewText(project.description)}</span>
          )}
        </div>
      )}

      {/* Expanded view */}
      {isExpanded && !isEditing && (
        <div className="px-4 pb-3 space-y-1">
          <div className="text-xs">
            <span className="text-gray-500">Name: </span>
            <span className="text-gray-300">{project?.name || 'Loading...'}</span>
          </div>
          {project?.description && (
            <div className="text-xs">
              <span className="text-gray-500">Description: </span>
              <span className="text-gray-400 whitespace-pre-wrap">{project.description}</span>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {isExpanded && isEditing && (
        <div className="px-4 pb-3 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
              Name
            </label>
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-[#F7931A]/50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
              Description
            </label>
            <Textarea
              ref={textareaRef}
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-[#F7931A]/50"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 px-2 text-xs text-gray-400">
              <X size={12} className="mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="h-7 px-3 text-xs bg-[#F7931A] hover:bg-[#d47b16] text-white">
              <Check size={12} className="mr-1" />
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectInfo;
