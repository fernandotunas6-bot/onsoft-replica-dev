type OpsScalar = string | number | boolean | null;

export function logPayflowEvent(event: string, fields: Record<string, OpsScalar> = {}) {
  console.info(
    JSON.stringify({
      app: "payflow",
      event,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}
