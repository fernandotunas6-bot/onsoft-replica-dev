import {
  CheckCircle2,
  Circle,
  Clock,
  PlayCircle,
} from "lucide-react"

export const categories = [
  {
    value: "bug",
    label: "Bug",
  },
  {
    value: "feature",
    label: "Funcionalidade",
  },
  {
    value: "documentation",
    label: "Docs",
  },
  {
    value: "improvement",
    label: "Melhoria",
  },
  {
    value: "refactor",
    label: "Refatoração",
  },
]

export const statuses = [
  {
    value: "pending",
    label: "Pendente",
    icon: Clock,
  },
  {
    value: "todo",
    label: "Por fazer",
    icon: Circle,
  },
  {
    value: "in progress",
    label: "Em curso",
    icon: PlayCircle,
  },
  {
    value: "completed",
    label: "Concluída",
    icon: CheckCircle2,
  },
]

export const priorities = [
  {
    label: "Menor",
    value: "minor"
  },
  {
    label: "Normal",
    value: "normal"
  },
  {
    label: "Importante",
    value: "important"
  },
  {
    label: "Crítica",
    value: "critical"
  },
]
