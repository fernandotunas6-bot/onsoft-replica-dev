import { z } from "zod";

// Lightweight: this module must not import Puck, the template or generated page HTML.
export const studioSearchSchema = z.object({
  pagina: z
    .string()
    .max(120)
    .regex(/^\/[a-z0-9/-]*$/)
    .catch("/"),
  largura: z.coerce
    .number()
    .refine((value) => [320, 390, 768, 1024, 1440, 1920].includes(value))
    .catch(1440),
  zoom: z.coerce
    .number()
    .refine((value) => [50, 75, 100].includes(value))
    .catch(50),
});
export type StudioView = z.infer<typeof studioSearchSchema>;
