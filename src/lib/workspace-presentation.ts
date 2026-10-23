/** School-owned UI preferences. Missing/invalid values use the master standard. */
export function workspacePresentation(preferences: unknown) {
  const values =
    preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : {};
  return {
    expandedSidebar: values["expandedSidebar"] === true,
    settingsModal: values["settingsModal"] === true,
  };
}
