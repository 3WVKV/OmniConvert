import { useCallback, useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  label: string;
  activeLabel: string;
  extensions?: string[];
  multiple?: boolean;
  onPaths: (paths: string[]) => void;
  className?: string;
}

export function DropZone({ label, activeLabel, extensions, multiple = true, onPaths, className }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  // Listen for Tauri native drag-drop events
  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setDragOver(true);
      } else if (event.payload.type === "drop") {
        setDragOver(false);
        let paths = event.payload.paths;
        // Filter by extension if specified
        if (extensions && extensions.length > 0) {
          paths = paths.filter((p) => {
            const ext = p.split(".").pop()?.toLowerCase() || "";
            return extensions.includes(ext);
          });
        }
        if (!multiple && paths.length > 1) {
          paths = [paths[0]];
        }
        if (paths.length > 0) {
          onPaths(paths);
        }
      } else if (event.payload.type === "leave") {
        setDragOver(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [extensions, multiple, onPaths]);

  const handleClick = useCallback(async () => {
    const filters = extensions && extensions.length > 0
      ? [{ name: "Files", extensions }]
      : [];

    const result = await open({
      multiple,
      filters,
    });

    if (!result) return;

    const paths = Array.isArray(result) ? result : [result];
    if (paths.length > 0) {
      onPaths(paths);
    }
  }, [extensions, multiple, onPaths]);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50",
        className
      )}
      onClick={handleClick}
    >
      <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {dragOver ? activeLabel : label}
      </p>
    </div>
  );
}
