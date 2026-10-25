import { z } from "zod";

// Lightweight: this module must not import Puck, the template or generated page HTML.
export const studioSearchSchema = z.object({
  pagina: z
    .string()
    .max(120)
    .regex(/^\/[a-z0-9/-]*$/)
    .default("/")
    .catch("/"),
  largura: z
    .preprocess(
      (value) => (typeof value === "string" ? Number(value) : value),
      z.number().refine((value) => [320, 390, 768, 1024, 1440, 1920].includes(value)),
    )
    .default(1440)
    .catch(1440),
  zoom: z
    .preprocess(
      (value) => (typeof value === "string" ? Number(value) : value),
      z.number().refine((value) => [50, 75, 100].includes(value)),
    )
    .default(50)
    .catch(50),
});
export type StudioView = z.infer<typeof studioSearchSchema>;
