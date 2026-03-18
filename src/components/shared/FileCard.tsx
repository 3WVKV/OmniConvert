import { X, FileIcon, Image, FileText, Music, Video, Archive, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FormatCategory } from "@/types/conversion";

const CATEGORY_ICONS: Record<FormatCategory, typeof FileIcon> = {
  image: Image,
  document: FileText,
  audio: Music,
  video: Video,
  archive: Archive,
  data: Database,
};

interface FileCardProps {
  name: string;
  size: number;
  extension: string;
  category: FormatCategory;
  status?: string;
  progress?: number;
  onRemove?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCard({ name, size, extension, category, status, progress, onRemove }: FileCardProps) {
  const Icon = CATEGORY_ICONS[category] || FileIcon;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 group">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatSize(size)}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {extension.toUpperCase()}
          </Badge>
          {status && (
            <Badge
              variant={status === "completed" ? "default" : status === "failed" ? "destructive" : "secondary"}
              className="text-[10px] px-1.5 py-0"
            >
              {status}
            </Badge>
          )}
        </div>
        {progress !== undefined && progress > 0 && progress < 100 && (
          <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
