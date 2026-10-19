/**
 * Motion classes for file workflows only. Opt-in; no changes to the existing
 * SIGA Plus layout, palette, component sizes, or navigation.
 *
 * Use these on the existing Arquivo components as they are integrated.
 */
export const fileMotion = {
  panel: "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
  interactive:
    "transition-[background-color,box-shadow,transform] duration-150 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-reduce:transition-none",
  progress: "transition-[width] duration-200 ease-out motion-reduce:transition-none",
  preview:
    "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150",
} as const;
