import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Download, Upload, HelpCircle, MoreHorizontal } from 'lucide-react';
import type { Project } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { projectService } from '../services/projectService';
import DeleteProjectDialog from './DeleteProjectDialog';
import { useTutorial } from '../context/TutorialContext';
import { MoreVertical } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  currentProject?: Project;
  onSelectProject: (project: Project, clearOpenFiles?: boolean) => void;
  onNewProject: () => void;
  onDeleteProject: (projectId: string) => Promise<void>;
  onProjectsChange: (projects: Project[]) => void;
  onDeleteAllProjects: () => Promise<void>;
}

const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  currentProject,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onProjectsChange,
  onDeleteAllProjects,
}) => {
  const [selectedId, setSelectedId] = useState(currentProject?.id || '');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { startTutorial } = useTutorial();

  useEffect(() => {
    setSelectedId(currentProject?.id || '');
  }, [currentProject]);

  const sortedProjects = [...projects].sort((a, b) => {
    const dateA = a.lastAccessed || a.lastModified;
    const dateB = b.lastAccessed || b.lastModified;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const handleProjectSelect = (value: string) => {
    setSelectedId(value);
    const project = projects.find(p => p.id === value);
    if (project) {
      onSelectProject({ ...project, lastAccessed: new Date() });
    }
  };

  const handleExportProject = async () => {
    if (!currentProject) return;
    try {
      const blob = await projectService.exportProjectAsZip(currentProject);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export project:', error);
    }
  };

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      let importedProject: Project;
      if (files[0].webkitRelativePath) {
        importedProject = await projectService.importFromFolder(files);
        onProjectsChange([...projects, importedProject]);
        onSelectProject(importedProject, true);
      } else if (files[0].name.endsWith('.zip')) {
        importedProject = await projectService.importProjectAsZip(files[0]);
        onProjectsChange([...projects, importedProject]);
        onSelectProject(importedProject, true);
      } else {
        const fileReader = new FileReader();
        const importPromise = new Promise<Project>((resolve) => {
          fileReader.onload = async (e) => {
            const content = e.target?.result as string;
            const projectData = JSON.parse(content);
            await projectService.saveProject(projectData);
            resolve(projectData);
          };
        });
        fileReader.readAsText(files[0]);
        importedProject = await importPromise;
        onProjectsChange([...projects, importedProject]);
        onSelectProject(importedProject, true);
      }
    } catch (error) {
      console.error('Failed to import project:', error);
    }
  };

  const handleDeleteConfirm = async (deleteAll: boolean) => {
    if (deleteAll) {
      await onDeleteAllProjects();
    } else if (currentProject) {
      await onDeleteProject(currentProject.id);
    }
    setIsDeleteDialogOpen(false);
  };

  const menuItems = (
    <>
      <DropdownMenuItem
        data-tutorial="create-project-button"
        onClick={onNewProject}
        className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer text-xs"
      >
        <PlusCircle className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
        New Project
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => document.getElementById('import-project')?.click()}
        className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer text-xs"
      >
        <Upload className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
        Import Project
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={handleExportProject}
        disabled={!currentProject}
        className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer text-xs"
      >
        <Download className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
        Export Project
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-border" />
      <DropdownMenuItem
        onClick={() => startTutorial()}
        className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer text-xs"
      >
        <HelpCircle className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
        Tutorial
      </DropdownMenuItem>
      {currentProject && (
        <>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-danger hover:bg-danger/10 hover:text-danger cursor-pointer text-xs"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
            Delete Project
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  return (
    <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
      {/* Project selector — compact chip style */}
      <Select value={selectedId} onValueChange={handleProjectSelect}>
        <SelectTrigger className="w-[min(48vw,180px)] md:w-[200px] h-8 text-xs bg-background/60 text-foreground/80 border-border rounded-lg hover:bg-accent transition-colors">
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border">
          {sortedProjects.map((project) => (
            <SelectItem
              key={project.id}
              value={project.id}
              className="text-foreground/80 text-xs hover:bg-accent cursor-pointer"
            >
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        type="file"
        id="import-project"
        className="hidden"
        accept=".zip,.json"
        {...({ webkitdirectory: "", directory: "" } as any)}
        multiple
        onChange={handleImportProject}
      />

      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label="Project actions"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border min-w-[170px]">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label="Project actions"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border min-w-[170px]">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DeleteProjectDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        projectName={currentProject?.name || 'project'}
      />
    </div>
  );
};

export default ProjectList;
