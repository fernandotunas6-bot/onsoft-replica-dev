import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canWriteFileArea, defaultVisibilityForArea, fileAreaMeta, visibleAreasForRole } from "./kinds";
import { readFilesPrefs, writeFilesPrefs, type FilesStaffPrefs } from "./prefs";

export function FilesSettingsPanel() {
  const account = useCurrentAccount();
  const areas = visibleAreasForRole(account.role).filter((area) => canWriteFileArea(account.role, area));
  const [prefs, setPrefs] = useState<FilesStaffPrefs>(() => readFilesPrefs(account.role));

  const save = () => {
    writeFilesPrefs(prefs);
    toast.success("Preferências de arquivos guardadas neste dispositivo");
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        O SIGA não usa uma chave de armazenamento gratuita partilhada — isso misturaria ficheiros de
        todas as escolas e atrasaria o sistema. Os bytes ficam no bucket privado <strong>siga-files</strong>{" "}
        do SGA. Se o bucket ou a tabela ainda não existirem, o ficheiro fica neste dispositivo
        (pastas ano/mês/área, como o WhatsApp). Microsoft 365 / OneDrive é opcional e catalog-ready
        em Integrações.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="files-area">Área por defeito ao carregar</Label>
        <select
          id="files-area"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={prefs.defaultArea}
          onChange={(event) => {
            const defaultArea = event.target.value as FilesStaffPrefs["defaultArea"];
            setPrefs({
              ...prefs,
              defaultArea,
              defaultVisibility: defaultVisibilityForArea(defaultArea),
            });
          }}
        >
          {areas.map((area) => (
            <option key={area} value={area}>
              {fileAreaMeta[area].label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="files-vis">Visibilidade por defeito</Label>
        <select
          id="files-vis"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={prefs.defaultVisibility}
          onChange={(event) =>
            setPrefs({
              ...prefs,
              defaultVisibility: event.target.value as FilesStaffPrefs["defaultVisibility"],
            })
          }
        >
          <option value="private">Privado (só eu, ou secretaria na área reservada)</option>
          <option value="school">Escola (colaboradores com acesso à área)</option>
          <option value="public">Público (pode ser ligado em páginas da escola)</option>
        </select>
      </div>
      <Button type="button" onClick={save}>
        Guardar neste dispositivo
      </Button>
    </div>
  );
}
