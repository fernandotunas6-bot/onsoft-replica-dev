/** @vitest-environment jsdom */
import { useLayoutEffect } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useDraftUnloadWarning } from "@/features/school-website/use-draft-unload-warning";
afterEach(cleanup);
it("actualiza o aviso de recarregamento no mesmo commit em que o estado guardado aparece", () => {
  const commits: boolean[] = [];
  const unload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  function Editor({ dirty }: { dirty: boolean }) {
    useDraftUnloadWarning(dirty);
    useLayoutEffect(() => {
      commits.push(unload());
    }, [dirty]);
    return <p>{dirty ? "Alterações por guardar" : "Guardado"}</p>;
  }
  const view = render(<Editor dirty />);
  view.rerender(<Editor dirty={false} />);
  view.rerender(<Editor dirty />);
  expect(commits).toEqual([true, false, true]);
  view.unmount();
  expect(unload()).toBe(false);
});
