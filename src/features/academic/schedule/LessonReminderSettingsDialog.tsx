import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { InlineLoading } from "@/components/ui/inline-loading";
import {
  getLessonReminderSettings,
  saveLessonReminderSettings,
} from "@/features/academic/timetable-lessons";
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from "@/features/academic/lesson-messages";
import { publicErrorMessage } from "@/lib/public-error";

const QUERY_KEY = ["academic", "lesson-reminder-settings"];

/** Avisos do horário: na publicação e lembrete da véspera (hora, destinatários, canais). */
export function LessonReminderSettingsDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: open,
    queryFn: () => getLessonReminderSettings(),
  });
  const [form, setForm] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  useEffect(() => {
    if (query.data?.settings) setForm(query.data.settings);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => saveLessonReminderSettings({ data: form }),
    onSuccess: () => {
      toast.success("Avisos do horário guardados.");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setOpen(false);
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível guardar.")),
  });
  const set = <K extends keyof ReminderSettings>(key: K, value: ReminderSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggle = (key: keyof ReminderSettings, label: string, hint?: string) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <div>
        <Label htmlFor={`reminder-${key}`} className="text-sm font-normal">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch
        id={`reminder-${key}`}
        checked={Boolean(form[key])}
        onCheckedChange={(checked) => set(key, checked as never)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs">
          <BellRing className="size-3.5" /> Avisos e lembretes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Avisos do horário</DialogTitle>
          <DialogDescription>
            O que professores, alunos e encarregados recebem quando o horário é publicado e na
            véspera de cada dia de aulas.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <InlineLoading label="A carregar configuração…" />
        ) : query.data && !query.data.available ? (
          <p className="text-sm text-muted-foreground">
            Os avisos do horário ficam disponíveis depois de aplicar a actualização da base de dados
            (migração 20260926140000).
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="divide-y divide-border">
              {toggle(
                "notifyOnPublish",
                "Avisar ao publicar",
                "Professores e alunos da turma recebem um aviso no portal.",
              )}
              {toggle("enabled", "Lembrete na véspera", "As aulas do dia seguinte, a cada pessoa.")}
            </div>

            {form.enabled ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="reminder-hour" className="text-sm font-normal">
                    Enviar às
                  </Label>
                  <select
                    id="reminder-hour"
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    value={form.sendHour}
                    onChange={(e) => set("sendHour", Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className="space-y-0 divide-y divide-border">
                  <legend className="pb-1 text-xs text-muted-foreground">Quem recebe</legend>
                  {toggle("notifyTeachers", "Professores", "Só as suas aulas, de todas as turmas.")}
                  {toggle("notifyStudents", "Alunos")}
                  {toggle("notifyGuardians", "Encarregados")}
                </fieldset>
                <fieldset className="space-y-0 divide-y divide-border">
                  <legend className="pb-1 text-xs text-muted-foreground">Canais</legend>
                  {toggle("channelInApp", "No portal")}
                  {toggle("channelEmail", "E-mail", "Para quem tem e-mail na ficha.")}
                  {toggle(
                    "channelSms",
                    "SMS",
                    "Para quem tem telefone na ficha. Tem custo por mensagem.",
                  )}
                </fieldset>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? "A guardar…" : "Guardar"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
