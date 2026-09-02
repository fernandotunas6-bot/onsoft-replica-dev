"use client";

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/language-context";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 px-2.5 font-medium cursor-pointer">
          <Globe className="h-4 w-4" />
          <span className="uppercase text-xs font-bold">{language}</span>
          <span className="sr-only">Alternar idioma</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className={`cursor-pointer font-medium ${language === "pt" ? "bg-accent" : ""}`}
          onClick={() => setLanguage("pt")}
        >
          Português (predefinido)
        </DropdownMenuItem>
        <DropdownMenuItem
          className={`cursor-pointer font-medium ${language === "en" ? "bg-accent" : ""}`}
          onClick={() => setLanguage("en")}
        >
          English (EN)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
