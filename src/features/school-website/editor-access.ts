/** A module grant cannot delegate control of the public institutional identity. */
export function requireSchoolWebsiteAdministrator(appRole: string): void {
  if (appRole !== "Administrador") {
    throw new Error("O website e o blog exigem o cargo de Administrador da própria escola.");
  }
}
