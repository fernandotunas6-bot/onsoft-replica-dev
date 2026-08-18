import { useState } from "react";
import { AlertTriangle, BookOpen, ChevronRight, Layers, Trophy } from "lucide-react";
import { IconChip } from "@/components/ui/icon-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface HeatmapSubjectGrade {
  discipline: string;
  code: string;
  average: number; // 0-20
}

export interface HeatmapClassGroup {
  classId: string;
  className: string;
  courseName: string;
  grades: HeatmapSubjectGrade[];
}

interface DisciplinePerformanceHeatmapProps {
  data?: HeatmapClassGroup[];
}

const mockClassData: HeatmapClassGroup[] = [
  {
    classId: "t1",
    className: "10ª Classe A",
    courseName: "Ciências Físicas e Biológicas",
    grades: [
      { discipline: "Física", code: "FIS", average: 8.4 },
      { discipline: "Matemática", code: "MAT", average: 9.2 },
      { discipline: "Química", code: "QMC", average: 11.5 },
      { discipline: "Língua Portuguesa", code: "LPO", average: 14.1 },
      { discipline: "Biologia", code: "BIO", average: 12.8 },
    ],
  },
  {
    classId: "t2",
    className: "11ª Classe B",
    courseName: "Ciências Económico-Jurídicas",
    grades: [
      { discipline: "Física", code: "FIS", average: 10.1 },
      { discipline: "Matemática", code: "MAT", average: 7.8 },
      { discipline: "Economia", code: "ECO", average: 13.4 },
      { discipline: "Língua Portuguesa", code: "LPO", average: 15.0 },
      { discipline: "Introdução ao Direito", code: "DIR", average: 12.2 },
    ],
  },
  {
    classId: "t3",
    className: "12ª Classe A",
    courseName: "Técnico de Informática",
    grades: [
      { discipline: "Física", code: "FIS", average: 11.8 },
      { discipline: "Matemática", code: "MAT", average: 10.5 },
      { discipline: "Programação", code: "PRG", average: 16.2 },
      { discipline: "Redes de Computadores", code: "RDC", average: 13.9 },
      { discipline: "Língua Portuguesa", code: "LPO", average: 12.0 },
    ],
  },
];

export function DisciplinePerformanceHeatmap({ data = mockClassData }: DisciplinePerformanceHeatmapProps) {
  const [selectedTerm, setSelectedTerm] = useState("t1");

  // Extrai lista única de disciplinas
  const allDisciplines = Array.from(
    new Set(data.flatMap((c) => c.grades.map((g) => g.discipline))),
  );

  return (
    <div className="surface-card p-6 space-y-5 rounded-2xl border border-border shadow-sm">
      {/* CABEÇALHO DO HEATMAP */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <IconChip icon={BookOpen} tone="primary" size="md" />
          <div>
            <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
              Heatmap de Desempenho por Disciplina
            </h3>
            <p className="text-xs text-muted-foreground">
              Matriz visual de médias com destaque de disciplinas abaixo do nível de aprovação (10 v.)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="w-[160px] text-xs h-8">
              <SelectValue placeholder="Trimestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="t1">1º Trimestre</SelectItem>
              <SelectItem value="t2">2º Trimestre</SelectItem>
              <SelectItem value="t3">3º Trimestre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* LEGENDA DE CORES */}
      <div className="flex flex-wrap items-center justify-between text-xs gap-3 p-3 rounded-xl border border-border bg-secondary/20">
        <span className="font-semibold text-muted-foreground">Nível de Aprovação:</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-3 rounded-full bg-destructive" />
            Crítico (&lt; 10 v.)
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-3 rounded-full bg-warning" />
            Suficiente (10 - 13 v.)
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-3 rounded-full bg-primary" />
            Bom (14 - 17 v.)
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-3 rounded-full bg-success" />
            Excelente (&ge; 18 v.)
          </span>
        </div>
      </div>

      {/* GRELHA MATRIZ DO HEATMAP */}
      <div className="overflow-x-auto no-scrollbar border border-border rounded-xl">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-secondary/40 text-muted-foreground uppercase font-bold border-b border-border">
            <tr>
              <th className="p-3 min-w-[160px]">Turma / Curso</th>
              {allDisciplines.map((disc) => (
                <th key={disc} className="p-3 text-center min-w-[100px]">
                  {disc}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {data.map((cGroup) => (
              <tr key={cGroup.classId} className="hover:bg-secondary/30 transition-colors">
                <td className="p-3 font-bold text-foreground">
                  <div>{cGroup.className}</div>
                  <div className="text-[10px] text-muted-foreground font-normal truncate max-w-[180px]">
                    {cGroup.courseName}
                  </div>
                </td>

                {allDisciplines.map((disc) => {
                  const match = cGroup.grades.find((g) => g.discipline === disc);
                  if (!match) {
                    return (
                      <td key={disc} className="p-3 text-center text-muted-foreground/40 font-mono">
                        —
                      </td>
                    );
                  }

                  const avg = match.average;
                  const isFail = avg < 10;
                  const isWarning = avg >= 10 && avg < 14;
                  const isGood = avg >= 14 && avg < 18;

                  let cellClass = "bg-success/15 text-success-strong font-extrabold border-success/30";
                  if (isFail) {
                    cellClass = "bg-destructive/20 text-destructive font-black border-destructive/40";
                  } else if (isWarning) {
                    cellClass = "bg-warning/20 text-warning-strong font-bold border-warning/40";
                  } else if (isGood) {
                    cellClass = "bg-primary/20 text-primary font-bold border-primary/30";
                  }

                  return (
                    <td key={disc} className="p-2 text-center">
                      <div
                        className={`py-1.5 px-2 rounded-lg border text-xs font-mono shadow-2xs transition-transform hover:scale-105 flex items-center justify-center gap-1 ${cellClass}`}
                      >
                        {isFail ? <AlertTriangle className="size-3.5 shrink-0" /> : null}
                        <span>{avg.toFixed(1)}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
