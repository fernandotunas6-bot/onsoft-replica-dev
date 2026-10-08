import { supabase } from "@/integrations/supabase/client";

export type ScheduledClassroom = {
  id: string;
  title: string;
  class_group_id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
};

type ClassroomResponse = {
  sessions?: ScheduledClassroom[];
  session?: ScheduledClassroom;
  error?: string;
};

async function classroomRequest(
  payload: Record<string, string>,
): Promise<ClassroomResponse> {
  const { data, error } = await supabase.functions.invoke<ClassroomResponse>(
    "bbb-classroom",
    { body: payload },
  );
  if (error) throw new Error("Não foi possível comunicar com as aulas virtuais.");
  if (!data || data.error) throw new Error(data?.error ?? "Resposta inválida do servidor.");
  return data;
}

export async function listVirtualClassrooms(schoolId: string) {
  const response = await classroomRequest({ action: "list", schoolId });
  return response.sessions ?? [];
}

export async function scheduleVirtualClassroom(input: {
  schoolId: string;
  classGroupId: string;
  teacherId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const response = await classroomRequest({ action: "schedule", ...input });
  if (!response.session) throw new Error("A aula não foi criada.");
  return response.session;
}
