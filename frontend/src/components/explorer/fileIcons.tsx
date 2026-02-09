import {
  File,
  FileJson,
  FileText,
  FileCode,
  FileType,
  Terminal,
  FileImage,
  FileVideo,
  FileAudio,
  FileCog,
  FileKey,
  Package,
} from 'lucide-react';

export const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    // Programming Languages
    case 'js':
    case 'jsx':
      return <FileCode size={15} className="text-yellow-400 shrink-0" />;
    case 'ts':
    case 'tsx':
      return <FileCode size={15} className="text-blue-400 shrink-0" />;
    case 'py':
      return <FileCode size={15} className="text-green-500 shrink-0" />;
    case 'rs':
      return <FileType size={15} className="text-orange-400 shrink-0" />;
    case 'go':
      return <FileCode size={15} className="text-cyan-400 shrink-0" />;

    // Config files
    case 'json':
      return <FileJson size={15} className="text-yellow-300 shrink-0" />;
    case 'yaml':
    case 'yml':
      return <FileCog size={15} className="text-red-400 shrink-0" />;
    case 'toml':
      return <FileCog size={15} className="text-blue-300 shrink-0" />;

    // Shell scripts
    case 'sh':
    case 'bash':
      return <Terminal size={15} className="text-purple-400 shrink-0" />;

    // Documentation
    case 'md':
    case 'txt':
      return <FileText size={15} className="text-blue-200 shrink-0" />;

    // Package files
    case 'lock':
      return <FileKey size={15} className="text-red-300 shrink-0" />;
    case 'cargo':
      return <Package size={15} className="text-orange-300 shrink-0" />;

    // Media files
    case 'jpg':
    case 'png':
    case 'gif':
    case 'svg':
      return <FileImage size={15} className="text-pink-400 shrink-0" />;
    case 'mp4':
    case 'mov':
      return <FileVideo size={15} className="text-purple-500 shrink-0" />;
    case 'mp3':
    case 'wav':
      return <FileAudio size={15} className="text-green-400 shrink-0" />;

    // Default
    default:
      return <File size={15} className="text-gray-400 shrink-0" />;
  }
};

export const getNodePath = (node: { name: string }, path: string[] = []): string => {
  if (path.length === 0 && ['src', 'client'].includes(node.name)) {
    return node.name;
  }
  return [...path, node.name].join('/');
};

export const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};
