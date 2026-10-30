import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Clock, DoorOpen, LogOut, QrCode, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { todayInLuanda } from "@/features/calendar/dates";
import { nowTimeInLuanda } from "@/features/dashboard/school-today";
import { confirmTeacherLessonPresence } from "@/features/pedagogica/teacher-presence-server";
import {
  lessonPresenceState,
  type LessonPresenceSession,
} from "@/features/pedagogica/lesson-presence-view";
import {
  TEACHER_CHECKIN_METHOD_LABELS,
  TEACHER_PRESENCE_LABELS,
  luandaTimeOf,
  teacherCheckinWindow,
  type TeacherPresenceState,
} from "@/features/pedagogica/teacher-presence";
import type { SchoolPresenceMode } from "@/features/pedagogica/school-qr";

const TONE: Record<TeacherPresenceState, string> = {
  confirmed: "text-success",
  late: "text-warning-strong",
  call_only: "text-success",
  awaiting: "text-warning-strong",
  missing: "text-destructive",
  upcoming: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};

/** No portal do próprio professor: fala com ele e não repete como confirmou. */
const SELF_LABELS: Partial<Record<TeacherPresenceState, string>> = {
  confirmed: "Na sala",
  late: "Entrou com atraso",
};

/** Linha curta com o estado da presença do professor nesta aula. */
export function TeacherPresenceLine({
  session,
  teacherName,
  self = false,
  className = "",
}: {
  session: LessonPresenceSession;
  teacherName?: string | null;
  /** Vista do próprio professor. */
  self?: boolean;
  className?: string;
}) {
  const state = lessonPresenceState(session);
  const presence = session.teacher_presence;
  const Icon =
    state === "confirmed" || state === "late" || state === "call_only"
      ? UserCheck
      : state === "missing"
        ? UserX
        : state === "awaiting"
          ? AlertCircle
          : Clock;
  let detail = "";
  if (presence?.teacher_checked_in_at) {
    detail = `desde ${luandaTimeOf(presence.teacher_checked_in_at)}`;
    if (state === "late") detail += ` · ${presence.teacher_late_minutes} min de atraso`;
    if (presence.teacher_checkin_method && !self) {
      detail += ` · ${TEACHER_CHECKIN_METHOD_LABELS[presence.teacher_checkin_method]}`;
    }
    if (presence.teacher_checked_out_at) {
      detail += ` · saiu ${luandaTimeOf(presence.teacher_checked_out_at)}`;
    }
  }
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-xs ${className}`}>
      <Icon className={`size-3.5 shrink-0 ${TONE[state]}`} aria-hidden />
      <span className={`font-semibold ${TONE[state]}`}>
        {(self ? SELF_LABELS[state] : null) ?? TEACHER_PRESENCE_LABELS[state]}
      </span>
      {teacherName || detail ? (
        <span className="truncate text-muted-foreground">
          {teacherName ? ` · ${teacherName}` : ""}
          {detail ? ` · ${detail}` : ""}
        </span>
      ) : null}
    </p>
  );
}

function useConfirmPresence(onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; action: "check_in" | "check_out"; note?: string }) =>
      confirmTeacherLessonPresence({ data: input }),
    onSuccess: (result, input) => {
      const time = luandaTimeOf(
        input.action === "check_in"
          ? result.presence.teacher_checked_in_at
          : result.presence.teacher_checked_out_at,
      );
      if (result.alreadyRecorded) {
        toast.info(
          input.action === "check_in"
            ? "A presença já estava registada"
            : "A saída já estava registada",
          { description: time ? `Às ${time}.` : undefined },
        );
      } else if (input.action === "check_in") {
        const late = result.presence.teacher_late_minutes ?? 0;
        toast.success("Presença na sala confirmada", {
          description: `${time ? `Às ${time}` : "Registada"}${late > 5 ? ` · ${late} min depois do início` : ""}.`,
        });
      } else {
        toast.success("Saída registada", { description: time ? `Às ${time}.` : undefined });
      }
      void queryClient.invalidateQueries({ queryKey: ["teacher-attendance-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["attendance-sheet"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onDone?.();
    },
    onError: (error) =>
      toast.error("Não foi possível registar a presença", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      }),
  });
}

/**
 * Botão do professor: «Estou na sala» na janela da aula e, depois, «Terminar aula».
 * Com o QR obrigatório na escola, em vez do «Estou na sala» leva a «Ler QR da escola».
 * Fora da janela não aparece nada (o estado já diz o que se passa).
 */
export function TeacherCheckinButton({
  session,
  mode = "button",
  size = "sm",
  className = "",
}: {
  session: LessonPresenceSession;
  mode?: SchoolPresenceMode;
  size?: "sm" | "default";
  className?: string;
}) {
  const confirm = useConfirmPresence();
  const presence = session.teacher_presence;
  if (session.status === "cancelled" || mode === "off") return null;
  const today = todayInLuanda();
  if (presence?.teacher_checked_in_at) {
    if (presence.teacher_checked_out_at || session.lesson_date !== today) return null;
    return (
      <Button
        type="button"
        size={size}
        variant="ghost"
        className={`gap-1.5 text-xs touch-manipulation ${className}`}
        disabled={confirm.isPending}
        onClick={() => confirm.mutate({ sessionId: session.id, action: "check_out" })}
      >
        <LogOut className="size-3.5" /> Terminar aula
      </Button>
    );
  }
  const window = teacherCheckinWindow({
    lessonDate: session.lesson_date,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    today,
    nowTime: nowTimeInLuanda(),
  });
  if (window !== "open") return null;
  if (mode === "qr") {
    return (
      <Button
        asChild
        size={size}
        className={`gap-1.5 text-xs font-semibold touch-manipulation ${className}`}
      >
        <Link to="/professor/presenca" hash="ler-qr">
          <QrCode className="size-3.5" /> Ler QR da escola
        </Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size={size}
      className={`gap-1.5 text-xs font-semibold touch-manipulation ${className}`}
      disabled={confirm.isPending}
      onClick={() => confirm.mutate({ sessionId: session.id, action: "check_in" })}
    >
      <DoorOpen className="size-3.5" />
      {confirm.isPending ? "A confirmar…" : "Estou na sala"}
    </Button>
  );
}

/**
 * Registo pela Direcção/Secretaria quando o professor esteve na aula mas não
 * conseguiu confirmar. Pede sempre o motivo, que fica gravado.
 */
export function TeacherPresenceManualRegister({ session }: { session: LessonPresenceSession }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const confirm = useConfirmPresence(() => {
    setOpen(false);
    setNote("");
  });
  const state = lessonPresenceState(session);
  if (state !== "awaiting" && state !== "missing") return null;
  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        Registar presença
      </Button>
    );
  }
  return (
    <form
      className="flex w-full items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        confirm.mutate({ sessionId: session.id, action: "check_in", note });
      }}
    >
      <Input
        aria-label="Motivo do registo da presença"
        placeholder="Motivo (ex.: telemóvel sem rede)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="h-8 text-xs"
        maxLength={500}
        autoFocus
      />
      <Button
        type="submit"
        size="sm"
        className="h-8 text-xs"
        disabled={confirm.isPending || note.trim().length < 5}
      >
        Gravar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 text-xs"
        onClick={() => setOpen(false)}
      >
        Cancelar
      </Button>
    </form>
  );
}
