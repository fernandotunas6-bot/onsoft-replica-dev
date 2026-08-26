import { useState } from "react";
import { Check, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export interface FieldComparison {
  field: string;
  label: string;
  sigaValue: string;
  excelValue: string;
  chosen: "siga" | "excel";
}

export function CompareRecordsModal({
  open,
  onOpenChange,
  recordName,
  similarity,
  comparisons,
  onConfirmChoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordName: string;
  similarity: number;
  comparisons: FieldComparison[];
  onConfirmChoice: (mergedFields: Record<string, string>) => void;
}) {
  const [choices, setChoices] = useState<Record<string, "siga" | "excel">>(
    comparisons.reduce((acc, curr) => ({ ...acc, [curr.field]: curr.chosen }), {}),
  );

  const handleToggle = (field: string, choice: "siga" | "excel") => {
    setChoices((prev) => ({ ...prev, [field]: choice }));
  };

  const handleSave = () => {
    const finalMerged: Record<string, string> = {};
    comparisons.forEach((item) => {
      const chosenSource = choices[item.field] || item.chosen;
      finalMerged[item.field] = chosenSource === "excel" ? item.excelValue : item.sigaValue;
    });
    onConfirmChoice(finalMerged);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <ShieldAlert className="size-5 text-amber-500" />
            Comparação Campo-a-Campo: {recordName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Possível duplicado identificado com <strong>{similarity}%</strong> de similaridade.
            Escolha os valores a manter.
          </p>
        </DialogHeader>

        <div className="my-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Campo</th>
                <th className="px-3 py-2 font-medium">No SIGA</th>
                <th className="px-3 py-2 font-medium">No Excel</th>
                <th className="px-3 py-2 text-right font-medium">Escolha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {comparisons.map((item) => {
                const currentChoice = choices[item.field] || item.chosen;
                return (
                  <tr key={item.field} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium text-foreground">{item.label}</td>
                    <td
                      className={`px-3 py-2 ${currentChoice === "siga" ? "font-bold text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {item.sigaValue || <span className="italic opacity-60">vazio</span>}
                    </td>
                    <td
                      className={`px-3 py-2 ${currentChoice === "excel" ? "font-bold text-blue-600" : "text-muted-foreground"}`}
                    >
                      {item.excelValue || <span className="italic opacity-60">vazio</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex rounded-md border border-border p-0.5">
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                            currentChoice === "siga"
                              ? "bg-emerald-500 text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => handleToggle(item.field, "siga")}
                        >
                          SIGA
                        </button>
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                            currentChoice === "excel"
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => handleToggle(item.field, "excel")}
                        >
                          Excel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave}>
            Aplicar Escolha <Check className="ml-1 size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
