/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Public website intentionally uses native browser modules.
import { setupAcademicMotion } from "../../painel/escolas/src/academic-motion.mjs";
type Entry = { target: Element; isIntersecting: boolean };
function environment(reduced = false) {
  let changed = () => {},
    hidden = false;
  const media = {
    matches: reduced,
    addEventListener: vi.fn((_name: string, fn: () => void) => {
      changed = fn;
    }),
    removeEventListener: vi.fn(),
  };
  const instances: {
    callback: (entries: Entry[]) => void;
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  class Observer {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(public callback: (entries: Entry[]) => void) {
      instances.push(this);
    }
  }
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const animations: {
    cancel: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    onfinish: (() => void) | null;
    oncancel: (() => void) | null;
  }[] = [];
  const animate = vi.fn((_frames?: Keyframe[], _options?: KeyframeAnimationOptions) => {
    const animation = {
      cancel: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
    };
    animation.cancel.mockImplementation(() => animation.oncancel?.());
    animations.push(animation);
    return animation;
  });
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  const win = {
    IntersectionObserver: Observer,
    matchMedia: () => media,
    MutationObserver: window.MutationObserver,
  };
  return {
    win,
    media,
    instances,
    animations,
    animate,
    change(value: boolean) {
      media.matches = value;
      changed();
    },
    visibility(value: boolean) {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  delete (Element.prototype as Partial<Element>).animate;
  document.body.innerHTML = "";
  document.documentElement.className = "";
  delete document.documentElement.dataset.websiteMotion;
});
describe("movimento académico progressivo", () => {
  it("mantém conteúdo visível, anima uma vez e termina ao focar um controlo", () => {
    document.body.innerHTML =
      '<section class="reveal"><h2>Conteúdo existente</h2><button>Continuar</button></section>';
    const env = environment(),
      controller = setupAcademicMotion({ doc: document, win: env.win });
    const node = document.querySelector("section")!;
    expect(node.hidden).toBe(false);
    expect(node.style.opacity).toBe("");
    expect(document.documentElement.classList.contains("motion-ready")).toBe(false);
    env.instances[0].callback([{ target: node, isIntersecting: true }]);
    expect(env.animate).toHaveBeenCalledTimes(1);
    document.querySelector("button")!.focus();
    expect(env.animations[0].cancel).toHaveBeenCalledTimes(1);
    controller.refresh();
    expect(env.instances[0].observe).toHaveBeenCalledTimes(1);
    controller.destroy();
    expect(env.instances[0].disconnect).toHaveBeenCalled();
  });
  it("respeita a preferência do sistema, pausa em segundo plano e cancela movimento ao reduzir", () => {
    document.body.innerHTML = '<article class="info-card">Informação</article>';
    const env = environment(true),
      controller = setupAcademicMotion({ doc: document, win: env.win }),
      node = document.querySelector("article")!;
    expect(env.instances[0].observe).not.toHaveBeenCalled();
    env.change(false);
    expect(env.instances[0].observe).toHaveBeenCalledTimes(1);
    env.instances[0].callback([{ target: node, isIntersecting: true }]);
    env.visibility(true);
    expect(env.animations[0].pause).toHaveBeenCalledTimes(1);
    env.visibility(false);
    expect(env.animations[0].play).toHaveBeenCalledTimes(1);
    env.change(true);
    expect(env.animations[0].cancel).toHaveBeenCalledTimes(1);
    controller.destroy();
    controller.refresh();
    expect(env.media.removeEventListener).toHaveBeenCalledTimes(1);
  });
  it("observa novos resultados do catálogo e respeita a preferência guardada do site", async () => {
    document.body.innerHTML = '<div id="course-results"></div>';
    const env = environment(),
      controller = setupAcademicMotion({ doc: document, win: env.win });
    document.querySelector("#course-results")!.innerHTML =
      '<article class="course-card">Curso publicado</article>';
    await vi.waitFor(() => expect(env.instances[0].observe).toHaveBeenCalledTimes(1));
    env.instances[0].callback([
      { target: document.querySelector("article")!, isIntersecting: true },
    ]);
    document.documentElement.classList.add("reduce-motion");
    await vi.waitFor(() => expect(env.animations[0].cancel).toHaveBeenCalledTimes(1));
    controller.destroy();
  });
});

it("o efeito de aparecimento não desloca os cartões e a opção sem animações mantém o conteúdo", () => {
  document.body.innerHTML = '<article class="course-card">Curso publicado</article>';
  document.documentElement.dataset.websiteMotion = "fade";
  const env = environment(),
    controller = setupAcademicMotion({ doc: document, win: env.win });
  env.instances[0].callback([{ target: document.querySelector("article")!, isIntersecting: true }]);
  expect(env.animate.mock.calls[0][0]).toEqual([{ opacity: 0.55 }, { opacity: 1 }]);
  controller.destroy();
  document.documentElement.dataset.websiteMotion = "none";
  const disabled = setupAcademicMotion({ doc: document, win: env.win });
  expect(document.querySelector("article")?.textContent).toBe("Curso publicado");
  disabled.destroy();
});

it("aplica aproximação suave com o ritmo escolhido e cancela quando o visitante reduz movimento", () => {
  document.body.innerHTML = '<article class="info-card">Informação</article>';
  document.documentElement.dataset.websiteMotion = "zoom";
  document.documentElement.dataset.websiteMotionSpeed = "calm";
  const env = environment(),
    controller = setupAcademicMotion({ doc: document, win: env.win });
  env.instances[0].callback([{ target: document.querySelector("article")!, isIntersecting: true }]);
  expect(env.animate.mock.calls[0][0]).toEqual([
    { opacity: 0.55, transform: "scale(.97)" },
    { opacity: 1, transform: "scale(1)" },
  ]);
  expect(env.animate.mock.calls[0][1]?.duration).toBe(650);
  env.change(true);
  expect(env.animations[0].cancel).toHaveBeenCalledTimes(1);
  controller.destroy();
  delete document.documentElement.dataset.websiteMotionSpeed;
});
