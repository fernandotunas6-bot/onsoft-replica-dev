/* eslint-disable react-refresh/only-export-components -- Local QA entry, not a hot-reload component library. */
// Local visual harness only. This directory is never an application route or public asset.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { WebsiteStudioWorkspace } from "../../../src/features/school-website/studio/WebsiteStudio";
import {
  changeWebsiteState,
  readWebsiteState,
} from "../../../src/features/school-website/content-model";
let saved = readWebsiteState(null);
saved.draft.websiteUrl = "https://qa-school.example";
const commands: unknown[] = [];
let failNext = false;
Object.assign(window, {
  studioQA: {
    commands,
    fail: () => {
      failNext = true;
    },
    saved: () => saved,
  },
});
function Editor() {
  const [view, setView] = useState({ pagina: "/", largura: 1440, zoom: 50 });
  return (
    <WebsiteStudioWorkspace
      initial={{
        state: saved,
        school: { public_code: "QA-STUDIO", name: "Colégio de Ensaio", logo_url: null },
        programs: [],
        campaigns: [],
        links: null,
      }}
      view={view}
      onViewChange={setView}
      onReload={async () => ({
        state: saved,
        school: { public_code: "QA-STUDIO", name: "Colégio de Ensaio", logo_url: null },
        programs: [],
        campaigns: [],
        links: null,
      })}
      onPersist={async (data) => {
        commands.push(data);
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (failNext) {
          failNext = false;
          throw Error("Falha de ensaio; o rascunho foi conservado.");
        }
        saved = changeWebsiteState(saved, data);
        return saved;
      }}
    />
  );
}
const root = createRootRoute({ component: Outlet });
const editor = createRoute({
  getParentRoute: () => root,
  path: "/website/editor",
  component: Editor,
});
const other = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: () => <p>Saída do estúdio</p>,
});
const router = createRouter({
  routeTree: root.addChildren([editor, other]),
  history: createMemoryHistory({ initialEntries: ["/website/editor"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
