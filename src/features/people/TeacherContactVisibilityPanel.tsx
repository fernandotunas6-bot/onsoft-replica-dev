import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Panel } from "@/components/layout/PageHeader";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { moduleIcons } from "@/lib/app-icons";
import {
  getMyTeacherContactVisibility,
  setMyTeacherContactVisibility,
} from "./teacher-contact-visibility";

const QUERY_KEY = ["teacher-contact-visibility"] as const;

/** O professor decide se alunos e encarregados vêem o seu e-mail e telefone. */
export function TeacherContactVisibilityPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getMyTeacherContactVisibility(),
  });
  const mutation = useMutation({
    mutationFn: (visible: boolean) => setMyTeacherContactVisibility({ data: { visible } }),
    onSuccess: (result) => {
      queryClient.setQueryData(QUERY_KEY, { isTeacher: true as const, visible: result.visible });
      toast.success(
        result.visible
          ? "Alunos e encarregados passam a ver o seu contacto."
          : "O seu contacto fica oculto para alunos e encarregados.",
      );
    },
    onError: (error) =>
      toast.error("Não foi possível guardar.", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });

  if (query.isLoading) return <InlineLoading className="px-1" />;
  if (!query.data?.isTeacher) return null;
  const visible = mutation.isPending ? !query.data.visible : query.data.visible;

  return (
    <Panel
      title="Contacto para alunos"
      description="Quem vê o seu e-mail e telefone."
      icon={moduleIcons.people}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="teacher-contact-visible">Visível para alunos e encarregados</Label>
          <p className="text-xs text-muted-foreground">
            {visible
              ? "Vêem o seu contacto."
              : "Vêem só o seu nome. O pessoal da escola vê sempre."}
          </p>
        </div>
        <Switch
          id="teacher-contact-visible"
          checked={visible}
          disabled={mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate(checked)}
        />
      </div>
    </Panel>
  );
}
