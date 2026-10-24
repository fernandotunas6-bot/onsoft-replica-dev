// QA wiring only: any accidental backend call fails instead of reaching a real institution.
export async function getSchoolWebsiteEditor() {
  throw Error("Use the local fixture, never the backend.");
}
export async function changeSchoolWebsite() {
  throw Error("Use the local command fixture, never the backend.");
}
