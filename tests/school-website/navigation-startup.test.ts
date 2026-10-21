/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), blog: vi.fn() }));
vi.mock("../../painel/escolas/src/site-content.mjs", () => ({
  connectSchoolWebsite: mocks.connect,
}));
vi.mock("../../painel/escolas/src/school-blog.mjs", () => ({
  setupSchoolBlog: mocks.blog,
}));

afterEach(() => vi.unstubAllGlobals());

it("permite usar o menu enquanto os conteúdos e o blog estão pendentes, sem duplicar os eventos", async () => {
  document.head.innerHTML =
    '<meta name="school-site-base" content="/escolas/demo"><meta name="school-site-home" content="/escolas/demo/">';
  document.body.innerHTML = `
    <script type="application/json" id="school-site-bootstrap">{"routes":["/cursos/"]}</script>
    <header class="site-header">
      <button class="mobile-toggle" aria-expanded="false">Menu</button>
      <nav id="main-nav"><details class="nav-dropdown"><summary>Estudar</summary>
        <div class="mega-menu"><a href="/cursos/">Cursos</a></div>
      </details></nav>
    </header>
    <main><form id="contact-form"><label>Nome<input name="name"></label><label>E-mail<input name="email" type="email"></label><label>Assunto<select name="subject"><option>Dúvida</option></select></label><label>Mensagem<textarea name="message" maxlength="200"></textarea></label></form></main><div id="toast"></div>
    <dialog id="site-dialog"><button class="dialog-close">Fechar</button><div id="dialog-content"></div></dialog>`;
  const mobile = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) =>
      query === "(max-width:760px)" ? mobile : Object.assign(new EventTarget(), { matches: true }),
    ),
  );
  let releaseContent!: (value: object) => void;
  let releaseBlog!: () => void;
  mocks.connect.mockReturnValue(
    new Promise((resolve) => {
      releaseContent = resolve;
    }),
  );
  mocks.blog.mockReturnValue(
    new Promise<void>((resolve) => {
      releaseBlog = resolve;
    }),
  );
  // @ts-expect-error The public website intentionally uses plain JavaScript modules.
  const ready = import("../../painel/escolas/src/app.js");
  try {
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
    const toggle = document.querySelector<HTMLButtonElement>(".mobile-toggle")!;
    const nav = document.querySelector<HTMLElement>("#main-nav")!;
    const courseLink = nav.querySelector("a")!;
    const checkMenu = () => {
      expect(nav.inert).toBe(true);
      toggle.click();
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(nav.classList.contains("open")).toBe(true);
      expect(nav.inert).toBe(false);
      nav.querySelector("a")!.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(nav.inert).toBe(true);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(toggle);
    };
    checkMenu();
    const pendingSubmission = new Event("submit", { bubbles: true, cancelable: true });
    document.querySelector("#contact-form")!.dispatchEvent(pendingSubmission);
    expect(pendingSubmission.defaultPrevented).toBe(true);
    expect(courseLink.getAttribute("href")).toBe("/escolas/demo/cursos/");
    // Published content can replace an existing link while the connection resolves.
    courseLink.setAttribute("href", "/cursos/");
    releaseContent({});
    await vi.waitFor(() => expect(mocks.blog).toHaveBeenCalledTimes(1));
    expect(courseLink.getAttribute("href")).toBe("/escolas/demo/cursos/");
    checkMenu();
    releaseBlog();
    await ready;
    checkMenu();
    mobile.matches = false;
    mobile.dispatchEvent(new Event("change"));
    expect(nav.inert).toBe(false);
    // Closing a disclosure at a breakpoint must leave the keyboard on its visible summary.
    mobile.matches = true;
    mobile.dispatchEvent(new Event("change"));
    toggle.click();
    nav.querySelector("details")!.open = true;
    courseLink.focus();
    mobile.matches = false;
    mobile.dispatchEvent(new Event("change"));
    expect(document.activeElement).toBe(nav.querySelector("summary"));
    const outside = document.querySelector<HTMLInputElement>("#contact-form input")!;
    outside.focus();
    mobile.matches = true;
    mobile.dispatchEvent(new Event("change"));
    expect(document.activeElement).toBe(outside);
  } finally {
    releaseContent({});
    releaseBlog();
    await ready;
  }
});
