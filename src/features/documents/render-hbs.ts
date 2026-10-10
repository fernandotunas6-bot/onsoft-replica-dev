import { escapeHtml } from "@/lib/escape-html";

/** Subconjunto Handlebars usado pelos .hbs em public/templates (if/else/each, this, @index, inc). */

type Frame = { data: unknown; index?: number };

function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, value);
}

function isTruthy(value: unknown): boolean {
  return !(value == null || value === false || value === "" || value === 0);
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function resolve(frame: Frame, expr: string): unknown {
  const trimmed = expr.trim();
  if (trimmed.startsWith("inc ")) {
    return Number(resolve(frame, trimmed.slice(4))) + 1;
  }
  if (trimmed === "@index") return frame.index ?? 0;
  if (trimmed === "this" || trimmed === ".") return frame.data;
  const path = trimmed.startsWith("this.") ? trimmed.slice(5) : trimmed;
  return getPath(frame.data, path);
}

type OpenTag = { helper: "if" | "each"; expr: string; start: number; end: number };
type CloseTag = { helper: "if" | "each"; start: number; end: number };
type ElseTag = { start: number; end: number };
type VarTag = { raw: boolean; expr: string; start: number; end: number };

function nextTag(src: string, from: number): OpenTag | CloseTag | ElseTag | VarTag | null {
  const open = src.indexOf("{{", from);
  if (open < 0) return null;
  if (src.startsWith("{{{", open)) {
    const rawClose = src.indexOf("}}}", open + 3);
    if (rawClose < 0) return null;
    return {
      raw: true,
      expr: src.slice(open + 3, rawClose).trim(),
      start: open,
      end: rawClose + 3,
    };
  }
  const close = src.indexOf("}}", open + 2);
  if (close < 0) return null;
  const end = close + 2;
  const inner = src.slice(open + 2, close).trim();
  if (inner === "else") return { start: open, end };
  if (inner.startsWith("#if "))
    return { helper: "if", expr: inner.slice(4).trim(), start: open, end };
  if (inner.startsWith("#each ")) {
    return { helper: "each", expr: inner.slice(6).trim(), start: open, end };
  }
  if (inner === "/if") return { helper: "if", start: open, end };
  if (inner === "/each") return { helper: "each", start: open, end };
  return { raw: false, expr: inner, start: open, end };
}

function findBlock(
  src: string,
  open: OpenTag,
): { elseAt: number | null; elseEnd: number | null; close: CloseTag } {
  let depth = 1;
  let elseAt: number | null = null;
  let elseEnd: number | null = null;
  let cursor = open.end;
  while (cursor < src.length) {
    const tag = nextTag(src, cursor);
    if (!tag) throw new Error("Bloco Handlebars sem fecho.");
    if ("helper" in tag && "expr" in tag) {
      depth += 1;
    } else if ("helper" in tag && !("expr" in tag)) {
      depth -= 1;
      if (depth === 0) {
        return { elseAt, elseEnd, close: tag };
      }
    } else if (!("expr" in tag) && !("helper" in tag) && depth === 1 && open.helper === "if") {
      elseAt = tag.start;
      elseEnd = tag.end;
    }
    cursor = tag.end;
  }
  throw new Error("Bloco Handlebars sem fecho.");
}

function renderFrame(src: string, frame: Frame): string {
  let out = "";
  let cursor = 0;
  while (cursor < src.length) {
    const tag = nextTag(src, cursor);
    if (!tag) {
      out += src.slice(cursor);
      break;
    }
    out += src.slice(cursor, tag.start);
    if ("raw" in tag && "expr" in tag) {
      const value = stringify(resolve(frame, tag.expr));
      out += tag.raw ? value : escapeHtml(value);
      cursor = tag.end;
      continue;
    }
    if ("expr" in tag && "helper" in tag) {
      const block = findBlock(src, tag);
      const innerEnd = block.elseAt ?? block.close.start;
      const consequent = src.slice(tag.end, innerEnd);
      const alternate = block.elseEnd != null ? src.slice(block.elseEnd, block.close.start) : "";
      if (tag.helper === "if") {
        out += renderFrame(isTruthy(resolve(frame, tag.expr)) ? consequent : alternate, frame);
      } else {
        const list = resolve(frame, tag.expr);
        if (Array.isArray(list)) {
          out += list.map((item, index) => renderFrame(consequent, { data: item, index })).join("");
        }
      }
      cursor = block.close.end;
      continue;
    }
    cursor = tag.end;
  }
  return out;
}

export function renderHandlebars(template: string, data: unknown): string {
  return renderFrame(template, { data });
}
