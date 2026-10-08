import { useState, type ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileMotion } from "@/components/files/file-motion";
import { FilePickerModal } from "./FilePickerModal";
import type { FileArea, FileKind } from "./kinds";
import type { SchoolFileRecord } from "./schemas";

export function PickFileButton({
  label = "Arquivo",
  area,
  acceptKinds,
  onPick,
  variant = "outline",
  size = "default",
  children,
}: {
  label?: string;
  area?: FileArea;
  acceptKinds?: readonly FileKind[];
  onPick?: (file: SchoolFileRecord) => void;
  variant?: "outline" | "ghost" | "secondary";
  size?: "default" | "sm";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        aria-label={label}
        variant={variant}
        size={size}
        className={`gap-2 ${fileMotion.interactive}`}
        onClick={() => setOpen(true)}
      >
        {children ?? (
          <>
            <FolderOpen className="size-4" />
            {label}
          </>
        )}
      </Button>
      <FilePickerModal
        open={open}
        onOpenChange={setOpen}
        area={area}
        acceptKinds={acceptKinds}
        onPick={onPick}
      />
    </>
  );
}
