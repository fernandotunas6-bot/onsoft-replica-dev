import { useEffect, useState } from "react";
import { Minus, Square, X, Shield, Cpu, Monitor } from "lucide-react";
import {
  isTauriDesktop,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  getNativeSystemInfo,
} from "@/lib/tauri-bridge";
import { useSchoolSettings } from "@/features/auth/use-school-settings";

export function DesktopTitleBar() {
  const { school } = useSchoolSettings();
  const [osName, setOsName] = useState<string>("desktop");
  const [isDesktop, setIsDesktop] = useState(false);
  const [forcadaPorQuery, setForcadaPorQuery] = useState(false);

  useEffect(() => {
    setIsDesktop(isTauriDesktop());
    setForcadaPorQuery(window.location.search.includes("show_titlebar"));
    void getNativeSystemInfo().then((info) => setOsName(info.os_type));
  }, []);

  // Em navegadores web padrão, só exibe a barra se for desktop ou para testes.
  //
  // A condição NÃO pode depender de `typeof window`. Tinha aqui um
  // `typeof window !== "undefined"`, posto para não ler `window.location` no
  // servidor — mas o efeito era inverter o resultado: no servidor a condição
  // dava falsa, a barra era renderizada no HTML, e no primeiro render do
  // cliente dava verdadeira e devolvia `null`. O servidor mandava uma barra que
  // o cliente não desenhava, em TODAS as páginas com `AppShell`, e a hidratação
  // falhava com o React #418 — o HTML do servidor era deitado fora a cada
  // visita, o que anula o SSR.
  //
  // `show_titlebar` passa por estado definido no efeito: assim o servidor e o
  // primeiro render do cliente concordam (ambos `null`), e a barra aparece no
  // render seguinte se for mesmo para aparecer.
  if (!isDesktop && !forcadaPorQuery) {
    return null;
  }

  return (
    <div
      data-tauri-drag-region
      className="h-9 bg-neutral-900 text-foreground flex items-center justify-between px-3 select-none text-xs border-b border-neutral-800 z-50 shrink-0 font-sans"
    >
      {/* NOME DA APLICAÇÃO E ESCOLA */}
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="size-5 rounded bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
          <Shield className="size-3 text-primary" />
        </div>
        <span className="font-extrabold text-foreground tracking-tight">SIGA Desktop</span>
        <span className="text-muted-foreground font-mono text-[10px]">v1.0 ({osName})</span>
        {school?.name ? (
          <span className="text-muted-foreground font-semibold text-[11px] ml-2 border-l border-neutral-700 pl-2">
            {school.name}
          </span>
        ) : null}
      </div>

      {/* BOTÕES ESTILO WINDOWS DE MINIMIZAR, MAXIMIZAR E FECHAR */}
      <div className="flex items-center -mr-3 h-full">
        <button
          type="button"
          onClick={() => void minimizeWindow()}
          title="Minimizar"
          className="h-full px-3.5 hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
        >
          <Minus className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => void toggleMaximizeWindow()}
          title="Maximizar / Restaurar"
          className="h-full px-3.5 hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
        >
          <Square className="size-3" />
        </button>

        <button
          type="button"
          onClick={() => void closeWindow()}
          title="Fechar"
          className="h-full px-4 hover:bg-destructive text-muted-foreground hover:text-destructive-foreground transition-colors flex items-center justify-center"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
