import { cn } from "@/lib/utils";

export type EducationWorkflowScene =
  "people" | "enrollment" | "guardian" | "teacher" | "classroom" | "school" | "success";

const sceneCopy: Record<
  EducationWorkflowScene,
  { eyebrow: string; title: string; description: string }
> = {
  people: {
    eyebrow: "Pessoas",
    title: "Uma pessoa, vários vínculos",
    description:
      "Confirme a identidade primeiro. Depois ligue a pessoa ao papel certo, sem duplicar a ficha.",
  },
  enrollment: {
    eyebrow: "Matrícula",
    title: "Uma etapa de cada vez",
    description:
      "Organize identidade, contactos e contexto académico antes de confirmar a matrícula.",
  },
  guardian: {
    eyebrow: "Relações",
    title: "Ligue a pessoa certa",
    description:
      "Associe encarregados e responsáveis já existentes, preservando o histórico da pessoa.",
  },
  teacher: {
    eyebrow: "Docentes",
    title: "Professor, turma e disciplina",
    description:
      "O vínculo docente deve nascer da pessoa e seguir o contexto académico real da escola.",
  },
  classroom: {
    eyebrow: "Estrutura académica",
    title: "Escolha o contexto certo",
    description:
      "Ano lectivo, curso, classe, turno, sala e turma são filtrados de forma hierárquica.",
  },
  school: {
    eyebrow: "SIGA Plus",
    title: "Dados organizados desde a origem",
    description:
      "A instituição mantém uma experiência simples sem perder rigor académico e multi-tenant.",
  },
  success: {
    eyebrow: "Concluído",
    title: "Tudo pronto",
    description:
      "O registo foi concluído e os próximos passos ficam disponíveis sem repetir dados.",
  },
};

export function EducationWorkflowVisual({
  scene = "school",
  eyebrow,
  title,
  description,
  className,
}: {
  scene?: EducationWorkflowScene;
  eyebrow?: string;
  title?: string;
  description?: string;
  className?: string;
}) {
  const copy = sceneCopy[scene];

  return (
    <section
      className={cn(
        "flex h-full min-h-[420px] flex-col justify-between overflow-hidden bg-muted/20 p-8",
        className,
      )}
    >
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        SIGA Plus
      </div>

      <div className="my-8 flex flex-1 items-center justify-center">
        <svg
          viewBox="0 0 520 360"
          className="h-auto w-full max-w-[520px]"
          aria-hidden="true"
          focusable="false"
        >
          <rect
            x="122"
            y="72"
            width="258"
            height="176"
            rx="12"
            className="fill-background stroke-border"
            strokeWidth="4"
          />
          <rect
            x="143"
            y="94"
            width="216"
            height="132"
            rx="7"
            className="fill-muted/30 stroke-border"
            strokeWidth="2"
          />

          <g className="text-primary">
            <rect
              x="52"
              y="58"
              width="48"
              height="48"
              rx="4"
              className="fill-current opacity-15"
            />
            <path d="M76 58v48M52 82h48" className="stroke-current" strokeWidth="3" />
            <circle cx="310" cy="116" r="24" className="fill-current opacity-10" />
            <path
              d="M310 92v48M286 116h48"
              className="stroke-current opacity-45"
              strokeWidth="3"
            />
          </g>

          <path
            d="M138 267h226"
            className="stroke-foreground/70"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M154 267l-18 62M350 267l18 62"
            className="stroke-foreground/55"
            strokeWidth="5"
            strokeLinecap="round"
          />

          <g>
            <circle
              cx="95"
              cy="226"
              r="20"
              className="fill-primary/20 stroke-foreground/70"
              strokeWidth="3"
            />
            <path
              d="M77 250h45l18 55H63z"
              className="fill-primary/15 stroke-foreground/70"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M83 305v28M118 305v28"
              className="stroke-foreground/65"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M122 262l34-10"
              className="stroke-primary"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>

          <g>
            <circle
              cx="414"
              cy="170"
              r="22"
              className="fill-primary/20 stroke-foreground/70"
              strokeWidth="3"
            />
            <path
              d="M391 194h46l18 78h-82z"
              className="fill-primary/15 stroke-foreground/70"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M392 215l-36 22M435 215l34-30"
              className="stroke-primary"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M392 272l-10 58M434 272l12 58"
              className="stroke-foreground/65"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>

          <g className="stroke-foreground/25" strokeWidth="3" strokeLinecap="round">
            <path d="M178 133h88" />
            <path d="M178 154h146" />
            <path d="M178 175h118" />
            <path d="M178 196h84" />
          </g>

          {scene === "success" ? (
            <g className="text-primary">
              <circle
                cx="307"
                cy="174"
                r="34"
                className="fill-background stroke-current"
                strokeWidth="5"
              />
              <path
                d="M290 174l12 12 23-27"
                className="fill-none stroke-current"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ) : null}

          {scene === "guardian" ? (
            <g>
              <circle
                cx="278"
                cy="282"
                r="13"
                className="fill-primary/20 stroke-foreground/60"
                strokeWidth="2"
              />
              <circle
                cx="314"
                cy="282"
                r="13"
                className="fill-primary/20 stroke-foreground/60"
                strokeWidth="2"
              />
              <path
                d="M261 315c5-15 15-22 29-22s24 7 29 22M297 315c5-15 15-22 29-22 9 0 17 3 23 10"
                className="fill-none stroke-foreground/55"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          ) : null}

          {scene === "classroom" ? (
            <g className="text-primary">
              <rect
                x="190"
                y="278"
                width="112"
                height="38"
                rx="8"
                className="fill-current opacity-10 stroke-current"
                strokeWidth="2"
              />
              <path
                d="M208 297h76"
                className="stroke-current"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          ) : null}
        </svg>
      </div>

      <div className="max-w-md space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow ?? copy.eyebrow}
        </p>
        <h3 className="text-2xl font-bold tracking-tight text-foreground">{title ?? copy.title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {description ?? copy.description}
        </p>
      </div>
    </section>
  );
}
