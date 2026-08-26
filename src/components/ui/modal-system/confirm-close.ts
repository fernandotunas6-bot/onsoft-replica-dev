/**
 * ModalShell já sabe recusar o fecho via ESC/clique fora quando
 * `hasUnsavedChanges` está activo, mas essa guarda vive numa closure interna
 * não exposta aos filhos — o botão × do ModalHeader e o "Cancelar" do
 * ModalFooter chamam `onOpenChange` directamente, sem passar por lá.
 * Os componentes do modal-system usam isto para os dois casos, em vez de
 * reimplementar a mesma confirmação em cada um.
 */
export function confirmDiscardChanges(hasUnsavedChanges: boolean): boolean {
  if (!hasUnsavedChanges) return true;
  return window.confirm("Existem alterações não guardadas. Fechar sem guardar?");
}
