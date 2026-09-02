import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ImportedTheme } from "@/types/theme-customizer";

interface ImportThemeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (theme: ImportedTheme) => void;
}

export function ImportThemeModal({ open, onOpenChange, onImport }: ImportThemeModalProps) {
  const [importText, setImportText] = React.useState("");

  const processImport = () => {
    try {
      if (!importText.trim()) {
        return;
      }

      const lightTheme: Record<string, string> = {};
      const darkTheme: Record<string, string> = {};

      // Remove comments
      const cssText = importText.replace(/\/\*[\s\S]*?\*\//g, "");

      // Extract :root section (light theme)
      const rootMatch = cssText.match(/:root\s*\{([^}]+)\}/);
      if (rootMatch) {
        const rootContent = rootMatch[1];
        const variableMatches = rootContent.matchAll(/--([^:]+):\s*([^;]+);/g);
        for (const match of variableMatches) {
          const [, variable, value] = match;
          lightTheme[variable.trim()] = value.trim();
        }
      }

      // Extract .dark section (dark theme)
      const darkMatch = cssText.match(/\.dark\s*\{([^}]+)\}/);
      if (darkMatch) {
        const darkContent = darkMatch[1];
        const variableMatches = darkContent.matchAll(/--([^:]+):\s*([^;]+);/g);
        for (const match of variableMatches) {
          const [, variable, value] = match;
          darkTheme[variable.trim()] = value.trim();
        }
      }

      // Fallback: if no :root or .dark wrappers found, parse all variables into both
      if (Object.keys(lightTheme).length === 0 && Object.keys(darkTheme).length === 0) {
        const variableMatches = cssText.matchAll(/--([^:]+):\s*([^;]+);/g);
        for (const match of variableMatches) {
          const [, variable, value] = match;
          lightTheme[variable.trim()] = value.trim();
          darkTheme[variable.trim()] = value.trim();
        }
      }

      const importedThemeData: ImportedTheme = { light: lightTheme, dark: darkTheme };
      onImport(importedThemeData);
      onOpenChange(false);
      setImportText("");
    } catch (error) {
      console.error("Erro ao importar tema:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[90vw] p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Importar CSS Personalizado</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Cole o código CSS do tema gerado no Tweakcn ou na Web. Inclua as secções <code>:root</code> (modo claro) e <code>.dark</code> (modo escuro) com variáveis CSS como <code>--primary</code>, <code>--background</code>, <code>--sidebar</code>, etc.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Textarea
            id="theme-css"
            className="w-full rounded-xl border border-input bg-muted/20 px-3 py-2 font-mono text-xs text-foreground min-h-[220px] max-h-[360px] resize-none"
            placeholder={`:root {\n  --background: #ffffff;\n  --foreground: #1e293b;\n  --primary: #6366f1;\n  --sidebar: #0f172a;\n  /* ... */\n}\n\n.dark {\n  --background: #0f172a;\n  --foreground: #f8fafc;\n  --primary: #818cf8;\n  --sidebar: #020617;\n  /* ... */\n}`}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={processImport} disabled={!importText.trim()}>
              Aplicar Tema
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
