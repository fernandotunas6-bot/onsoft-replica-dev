/**
 * Motor determinístico de sugestão de horários.
 *
 * Puro (sem I/O): recebe a carga semanal da turma, os blocos do turno, as
 * ocupações de professores e salas noutras turmas e, opcionalmente, o modelo
 * do período anterior. Devolve uma proposta sem conflitos, métricas e a lista
 * de alterações face ao modelo anterior — é isto que permite "sugerir e
 * alterar em pequenos pontos" no período seguinte.
 */

export type EngineBlock = {
  /** Número do tempo lectivo dentro do turno (1..n, sem intervalos). */
  number: number;
  startsAt: string; // HH:MM
  endsAt: string; // HH:MM
};

export type EngineDemand = {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string | null;
  teacherId: string | null;
  teacherName?: string | null;
  weeklyPeriods: number;
  /** 0 = leve (ex.: Educação Física), 1 = pesada (ex.: Matemática). */
  weight?: number;
  color?: string | null;
};

export type EnginePlacement = {
  classSubjectId: string;
  weekday: number;
  block: number;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  room: string | null;
  pinned?: boolean;
};

export type EngineAvailabilityWindow = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  available: boolean;
};

export type EngineOptions = {
  /** Máximo de tempos da mesma disciplina no mesmo dia (por omissão 2). */
  maxSamePerDay?: number;
  /** Permitir tempos geminados (dois seguidos) — por omissão sim. */
  allowDoubles?: boolean;
  /** Disciplinas pesadas mais cedo — por omissão sim. */
  heavyEarly?: boolean;
  /** Peso da continuidade face ao modelo anterior (0 = ignorar). */
  continuityWeight?: number;
  /** Semente para desempates reprodutíveis. */
  seed?: number;
  /** Passagens de melhoria local (trocas). */
  improvementPasses?: number;
};

export type EngineInput = {
  classGroupId: string;
  roomId: string | null;
  roomLabel: string | null;
  weekdays: number[];
  blocks: EngineBlock[];
  demands: EngineDemand[];
  /** teacherId -> células ocupadas noutras turmas ("weekday:HH:MM"). */
  teacherBusy: Record<string, string[]>;
  /** roomId -> células ocupadas por outras turmas. */
  roomBusy: Record<string, string[]>;
  teacherAvailability?: Record<string, EngineAvailabilityWindow[]>;
  /** Modelo do período anterior (ou horário actual) para continuidade. */
  previous?: EnginePlacement[];
  /** Células fixadas pelo utilizador — nunca são movidas. */
  pinned?: EnginePlacement[];
  /** Células indisponíveis ("weekday:block"), ex.: reunião geral. */
  blockedCells?: string[];
  options?: EngineOptions;
};

export type EngineUnplaced = {
  classSubjectId: string;
  subjectName: string;
  missing: number;
  reason: string;
};

export type EngineChangeKind = "kept" | "moved" | "added" | "removed";

export type EngineChange = {
  kind: EngineChangeKind;
  classSubjectId: string;
  subjectName: string;
  from?: { weekday: number; block: number };
  to?: { weekday: number; block: number };
  reason: string;
};

export type EngineMetrics = {
  score: number;
  filled: number;
  required: number;
  capacity: number;
  /** % de tempos mantidos face ao modelo anterior (null sem modelo). */
  continuity: number | null;
  dailyLoad: Record<number, number>;
  /** Por disciplina: tempos por dia da semana. */
  spread: Record<string, Record<number, number>>;
  doubles: number;
  conflicts: 0;
};

export type EngineResult = {
  placements: EnginePlacement[];
  unplaced: EngineUnplaced[];
  metrics: EngineMetrics;
  changes: EngineChange[];
  explanations: string[];
};

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? `Dia ${weekday}`;
}

export function cellKey(weekday: number, startsAt: string): string {
  return `${weekday}:${startsAt.slice(0, 5)}`;
}

export function blockKey(weekday: number, block: number): string {
  return `${weekday}:${block}`;
}

/** Peso pedagógico por nome de disciplina (0 leve … 1 pesada). */
export function subjectWeight(name: string): number {
  const n = name.toLowerCase();
  if (/matem|portugu|f[ií]sica(?!.*educa)|qu[ií]mica|biolog/.test(n) && !/educa/.test(n)) return 1;
  if (/educa[cç][aã]o f[ií]sica|desporto|visual|pl[aá]stica|musical|manual|laboral|moral|c[ií]vica/.test(n))
    return 0;
  if (/hist|geogr|filos|ingl|franc|inform|tic|program|econom|contab/.test(n)) return 0.55;
  return 0.5;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function teacherAvailable(
  windows: EngineAvailabilityWindow[] | undefined,
  weekday: number,
  block: EngineBlock,
): boolean {
  if (!windows || windows.length === 0) return true;
  const dayWindows = windows.filter((w) => w.weekday === weekday);
  if (dayWindows.length === 0) return true;
  const s = toMinutes(block.startsAt);
  const e = toMinutes(block.endsAt);
  const blockedExplicitly = dayWindows.some(
    (w) => !w.available && toMinutes(w.startsAt) < e && s < toMinutes(w.endsAt),
  );
  if (blockedExplicitly) return false;
  const positive = dayWindows.filter((w) => w.available);
  if (positive.length === 0) return true;
  return positive.some((w) => toMinutes(w.startsAt) <= s && toMinutes(w.endsAt) >= e);
}

type Grid = Map<string, EnginePlacement>; // blockKey -> placement

type Ctx = {
  input: EngineInput;
  opts: Required<EngineOptions>;
  blocksByNumber: Map<number, EngineBlock>;
  demandById: Map<string, EngineDemand>;
  teacherBusy: Map<string, Set<string>>;
  roomBusy: Map<string, Set<string>>;
  previousByCell: Map<string, string>; // blockKey -> classSubjectId
  blocked: Set<string>;
  rand: () => number;
};

function buildCtx(input: EngineInput): Ctx {
  const opts: Required<EngineOptions> = {
    maxSamePerDay: input.options?.maxSamePerDay ?? 2,
    allowDoubles: input.options?.allowDoubles ?? true,
    heavyEarly: input.options?.heavyEarly ?? true,
    continuityWeight: input.options?.continuityWeight ?? 6,
    seed: input.options?.seed ?? 20260925,
    improvementPasses: input.options?.improvementPasses ?? 3,
  };
  const teacherBusy = new Map<string, Set<string>>();
  for (const [teacherId, cells] of Object.entries(input.teacherBusy ?? {})) {
    teacherBusy.set(teacherId, new Set(cells.map((c) => `${c.split(":")[0]}:${c.slice(c.indexOf(":") + 1, c.indexOf(":") + 6)}`)));
  }
  const roomBusy = new Map<string, Set<string>>();
  for (const [roomId, cells] of Object.entries(input.roomBusy ?? {})) {
    roomBusy.set(roomId, new Set(cells.map((c) => `${c.split(":")[0]}:${c.slice(c.indexOf(":") + 1, c.indexOf(":") + 6)}`)));
  }
  const previousByCell = new Map<string, string>();
  for (const p of input.previous ?? []) previousByCell.set(blockKey(p.weekday, p.block), p.classSubjectId);
  return {
    input,
    opts,
    blocksByNumber: new Map(input.blocks.map((b) => [b.number, b])),
    demandById: new Map(input.demands.map((d) => [d.classSubjectId, d])),
    teacherBusy,
    roomBusy,
    previousByCell,
    blocked: new Set(input.blockedCells ?? []),
    rand: mulberry32(opts.seed),
  };
}

function isCellFree(ctx: Ctx, grid: Grid, demand: EngineDemand, weekday: number, block: EngineBlock): boolean {
  const bk = blockKey(weekday, block.number);
  if (ctx.blocked.has(bk) || grid.has(bk)) return false;
  const ck = cellKey(weekday, block.startsAt);
  if (demand.teacherId && ctx.teacherBusy.get(demand.teacherId)?.has(ck)) return false;
  if (ctx.input.roomId && ctx.roomBusy.get(ctx.input.roomId)?.has(ck)) return false;
  if (demand.teacherId && !teacherAvailable(ctx.input.teacherAvailability?.[demand.teacherId], weekday, block))
    return false;
  return true;
}

function countSubjectOnDay(grid: Grid, classSubjectId: string, weekday: number): number {
  let n = 0;
  for (const p of grid.values()) if (p.classSubjectId === classSubjectId && p.weekday === weekday) n++;
  return n;
}

function dayLoad(grid: Grid, weekday: number): number {
  let n = 0;
  for (const p of grid.values()) if (p.weekday === weekday) n++;
  return n;
}

function hasAdjacentSame(grid: Grid, classSubjectId: string, weekday: number, block: number): boolean {
  const prev = grid.get(blockKey(weekday, block - 1));
  const next = grid.get(blockKey(weekday, block + 1));
  return prev?.classSubjectId === classSubjectId || next?.classSubjectId === classSubjectId;
}

function teacherAdjacentElsewhere(ctx: Ctx, teacherId: string | null, weekday: number, block: EngineBlock): boolean {
  if (!teacherId) return false;
  const busy = ctx.teacherBusy.get(teacherId);
  if (!busy) return false;
  const prev = ctx.blocksByNumber.get(block.number - 1);
  const next = ctx.blocksByNumber.get(block.number + 1);
  return Boolean(
    (prev && busy.has(cellKey(weekday, prev.startsAt))) || (next && busy.has(cellKey(weekday, next.startsAt))),
  );
}

/** Pontuação de colocar `demand` na célula — maior é melhor. */
function scoreCell(ctx: Ctx, grid: Grid, demand: EngineDemand, weekday: number, block: EngineBlock): number {
  const { opts } = ctx;
  const nBlocks = ctx.input.blocks.length;
  const weight = demand.weight ?? subjectWeight(demand.subjectName);
  let score = 0;

  const sameDay = countSubjectOnDay(grid, demand.classSubjectId, weekday);
  const adjacent = hasAdjacentSame(grid, demand.classSubjectId, weekday, block.number);
  if (sameDay >= opts.maxSamePerDay) score -= 100;
  else if (sameDay > 0) {
    // Já há um tempo desta disciplina no dia: só compensa se ficar geminado.
    score += opts.allowDoubles && adjacent ? 2 : -9;
  }

  if (opts.heavyEarly) {
    const position = (block.number - 1) / Math.max(1, nBlocks - 1); // 0 = primeiro tempo
    score += (0.5 - position) * 6 * (weight - 0.5) * 2;
  }

  const avg = ctx.input.demands.reduce((s, d) => s + d.weeklyPeriods, 0) / Math.max(1, ctx.input.weekdays.length);
  const load = dayLoad(grid, weekday);
  score -= Math.max(0, load + 1 - avg) * 1.6;
  // Preferir manhã cedo compacta: penalizar buracos (célula anterior vazia mas há aulas antes).
  const prevKey = blockKey(weekday, block.number - 1);
  if (block.number > 1 && !grid.has(prevKey) && load > 0) score -= 2.5;

  if (teacherAdjacentElsewhere(ctx, demand.teacherId, weekday, block)) score += 0.8;

  if (opts.continuityWeight > 0 && ctx.previousByCell.get(blockKey(weekday, block.number)) === demand.classSubjectId) {
    score += opts.continuityWeight;
  }

  score += ctx.rand() * 0.6; // desempate reprodutível
  return score;
}

function placementFor(
  ctx: Ctx,
  demand: EngineDemand,
  weekday: number,
  block: EngineBlock,
  pinned = false,
): EnginePlacement {
  return {
    classSubjectId: demand.classSubjectId,
    weekday,
    block: block.number,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    roomId: ctx.input.roomId,
    room: ctx.input.roomLabel,
    pinned,
  };
}

function objective(ctx: Ctx, grid: Grid): number {
  // Objectivo global: soma das pontuações de cada colocação num "grid" congelado.
  let total = 0;
  const entries = [...grid.values()];
  for (const p of entries) {
    const d = ctx.demandById.get(p.classSubjectId);
    const b = ctx.blocksByNumber.get(p.block);
    if (!d || !b) continue;
    const without: Grid = new Map(grid);
    without.delete(blockKey(p.weekday, p.block));
    const saved = ctx.rand;
    ctx.rand = () => 0;
    total += scoreCell(ctx, without, d, p.weekday, b);
    ctx.rand = saved;
  }
  return total;
}

function improveBySwaps(ctx: Ctx, grid: Grid) {
  const keys = () => [...grid.keys()].filter((k) => !grid.get(k)?.pinned);
  for (let pass = 0; pass < ctx.opts.improvementPasses; pass++) {
    let improved = false;
    let base = objective(ctx, grid);
    const ks = keys();
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = grid.get(ks[i]!);
        const b = grid.get(ks[j]!);
        if (!a || !b || a.classSubjectId === b.classSubjectId) continue;
        const da = ctx.demandById.get(a.classSubjectId)!;
        const dbb = ctx.demandById.get(b.classSubjectId)!;
        const ba = ctx.blocksByNumber.get(a.block)!;
        const bb = ctx.blocksByNumber.get(b.block)!;
        // Trocar: a vai para célula de b e vice-versa. Validar constrangimentos.
        grid.delete(ks[i]!);
        grid.delete(ks[j]!);
        const okA = isCellFree(ctx, grid, da, b.weekday, bb);
        const okB = isCellFree(ctx, grid, dbb, a.weekday, ba);
        if (!okA || !okB) {
          grid.set(ks[i]!, a);
          grid.set(ks[j]!, b);
          continue;
        }
        const na = placementFor(ctx, da, b.weekday, bb);
        const nb = placementFor(ctx, dbb, a.weekday, ba);
        grid.set(blockKey(na.weekday, na.block), na);
        grid.set(blockKey(nb.weekday, nb.block), nb);
        const after = objective(ctx, grid);
        if (after > base + 0.01) {
          base = after;
          improved = true;
        } else {
          grid.delete(blockKey(na.weekday, na.block));
          grid.delete(blockKey(nb.weekday, nb.block));
          grid.set(ks[i]!, a);
          grid.set(ks[j]!, b);
        }
      }
    }
    if (!improved) break;
  }
}

function describeCell(weekday: number, block: number): string {
  return `${weekdayLabel(weekday)}, ${block}º tempo`;
}

export function diffPlacements(
  previous: EnginePlacement[] | undefined,
  next: EnginePlacement[],
  demandById: Map<string, EngineDemand>,
  reasons: Map<string, string> = new Map(),
): EngineChange[] {
  const changes: EngineChange[] = [];
  if (!previous) return changes;
  const name = (id: string) => demandById.get(id)?.subjectName ?? "Disciplina";
  const prevByCell = new Map(previous.map((p) => [blockKey(p.weekday, p.block), p]));
  const nextByCell = new Map(next.map((p) => [blockKey(p.weekday, p.block), p]));

  const prevRemaining = new Map<string, EnginePlacement[]>();
  const nextRemaining = new Map<string, EnginePlacement[]>();
  for (const [k, p] of prevByCell) {
    if (nextByCell.get(k)?.classSubjectId === p.classSubjectId) {
      changes.push({
        kind: "kept",
        classSubjectId: p.classSubjectId,
        subjectName: name(p.classSubjectId),
        from: { weekday: p.weekday, block: p.block },
        to: { weekday: p.weekday, block: p.block },
        reason: "Mantido como no período anterior.",
      });
    } else {
      prevRemaining.set(p.classSubjectId, [...(prevRemaining.get(p.classSubjectId) ?? []), p]);
    }
  }
  for (const [k, p] of nextByCell) {
    if (prevByCell.get(k)?.classSubjectId !== p.classSubjectId) {
      nextRemaining.set(p.classSubjectId, [...(nextRemaining.get(p.classSubjectId) ?? []), p]);
    }
  }
  const ids = new Set([...prevRemaining.keys(), ...nextRemaining.keys()]);
  for (const id of ids) {
    const olds = prevRemaining.get(id) ?? [];
    const news = nextRemaining.get(id) ?? [];
    const n = Math.min(olds.length, news.length);
    for (let i = 0; i < n; i++) {
      changes.push({
        kind: "moved",
        classSubjectId: id,
        subjectName: name(id),
        from: { weekday: olds[i]!.weekday, block: olds[i]!.block },
        to: { weekday: news[i]!.weekday, block: news[i]!.block },
        reason:
          reasons.get(id) ??
          `Passou de ${describeCell(olds[i]!.weekday, olds[i]!.block)} para ${describeCell(news[i]!.weekday, news[i]!.block)} para evitar conflito ou equilibrar a semana.`,
      });
    }
    for (let i = n; i < olds.length; i++) {
      changes.push({
        kind: "removed",
        classSubjectId: id,
        subjectName: name(id),
        from: { weekday: olds[i]!.weekday, block: olds[i]!.block },
        reason: reasons.get(id) ?? "A carga semanal desta disciplina diminuiu ou deixou de existir na turma.",
      });
    }
    for (let i = n; i < news.length; i++) {
      changes.push({
        kind: "added",
        classSubjectId: id,
        subjectName: name(id),
        to: { weekday: news[i]!.weekday, block: news[i]!.block },
        reason: reasons.get(id) ?? "Tempo novo para completar a carga semanal.",
      });
    }
  }
  const order: Record<EngineChangeKind, number> = { moved: 0, added: 1, removed: 2, kept: 3 };
  return changes.sort((a, b) => order[a.kind] - order[b.kind] || a.subjectName.localeCompare(b.subjectName));
}

export function computeMetrics(ctx: Ctx | EngineInput, placements: EnginePlacement[]): EngineMetrics {
  const input = "input" in ctx ? ctx.input : ctx;
  const required = input.demands.reduce((s, d) => s + d.weeklyPeriods, 0);
  const capacity = input.weekdays.length * input.blocks.length - (input.blockedCells?.length ?? 0);
  const dailyLoad: Record<number, number> = {};
  const spread: Record<string, Record<number, number>> = {};
  for (const w of input.weekdays) dailyLoad[w] = 0;
  let doubles = 0;
  const byKey = new Map(placements.map((p) => [blockKey(p.weekday, p.block), p]));
  for (const p of placements) {
    dailyLoad[p.weekday] = (dailyLoad[p.weekday] ?? 0) + 1;
    spread[p.classSubjectId] ??= {};
    spread[p.classSubjectId]![p.weekday] = (spread[p.classSubjectId]![p.weekday] ?? 0) + 1;
    if (byKey.get(blockKey(p.weekday, p.block + 1))?.classSubjectId === p.classSubjectId) doubles++;
  }
  let continuity: number | null = null;
  if (input.previous && input.previous.length) {
    const prev = new Map(input.previous.map((p) => [blockKey(p.weekday, p.block), p.classSubjectId]));
    let kept = 0;
    for (const p of placements) if (prev.get(blockKey(p.weekday, p.block)) === p.classSubjectId) kept++;
    continuity = Math.round((kept / input.previous.length) * 100);
  }
  // Pontuação 0..100: cobertura (60), distribuição (25), continuidade (15 quando existe).
  const coverage = required ? placements.length / required : 1;
  let spreadPenalty = 0;
  for (const days of Object.values(spread)) {
    for (const n of Object.values(days)) if (n > 2) spreadPenalty += n - 2;
  }
  const loads = Object.values(dailyLoad);
  const maxLoad = Math.max(0, ...loads);
  const minLoad = loads.length ? Math.min(...loads) : 0;
  const balance = Math.max(0, 1 - (maxLoad - minLoad) / Math.max(1, input.blocks.length));
  const distribution = Math.max(0, 1 - spreadPenalty * 0.15) * 0.6 + balance * 0.4;
  const score = Math.round(
    coverage * 60 + distribution * 25 + (continuity === null ? 15 : (continuity / 100) * 15),
  );
  return {
    score: Math.max(0, Math.min(100, score)),
    filled: placements.length,
    required,
    capacity,
    continuity,
    dailyLoad,
    spread,
    doubles,
    conflicts: 0,
  };
}

/** Gera uma proposta de horário para uma turma. */
export function suggestTimetable(input: EngineInput): EngineResult {
  const ctx = buildCtx(input);
  const grid: Grid = new Map();
  const unplaced: EngineUnplaced[] = [];
  const explanations: string[] = [];
  const reasons = new Map<string, string>();

  // 1. Fixados pelo utilizador.
  for (const pin of input.pinned ?? []) {
    const demand = ctx.demandById.get(pin.classSubjectId);
    const block = ctx.blocksByNumber.get(pin.block);
    if (!demand || !block) continue;
    if (!isCellFree(ctx, grid, demand, pin.weekday, block)) {
      explanations.push(
        `Não foi possível manter ${demand.subjectName} fixada em ${describeCell(pin.weekday, pin.block)}: o professor ou a sala já estão ocupados.`,
      );
      continue;
    }
    grid.set(blockKey(pin.weekday, pin.block), placementFor(ctx, demand, pin.weekday, block, true));
  }

  // 2. Ordem de colocação: mais tempos primeiro, depois professores com menos células livres.
  const freeCellsForTeacher = (d: EngineDemand) => {
    let n = 0;
    for (const w of input.weekdays) for (const b of input.blocks) if (isCellFree(ctx, grid, d, w, b)) n++;
    return n;
  };
  const remaining = new Map<string, number>();
  for (const d of input.demands) {
    const pinnedCount = [...grid.values()].filter((p) => p.classSubjectId === d.classSubjectId).length;
    remaining.set(d.classSubjectId, Math.max(0, d.weeklyPeriods - pinnedCount));
  }
  const order = [...input.demands].sort((a, b) => {
    const ra = remaining.get(a.classSubjectId) ?? 0;
    const rb = remaining.get(b.classSubjectId) ?? 0;
    if (rb !== ra) return rb - ra;
    return freeCellsForTeacher(a) - freeCellsForTeacher(b);
  });

  // 3. Colocação gulosa, um tempo de cada vez, alternando disciplinas para
  //    distribuir pela semana (round-robin ponderado).
  let progress = true;
  while (progress) {
    progress = false;
    for (const demand of order) {
      const left = remaining.get(demand.classSubjectId) ?? 0;
      if (left <= 0) continue;
      let best: { weekday: number; block: EngineBlock; score: number } | null = null;
      for (const weekday of input.weekdays) {
        for (const block of input.blocks) {
          if (!isCellFree(ctx, grid, demand, weekday, block)) continue;
          const s = scoreCell(ctx, grid, demand, weekday, block);
          if (!best || s > best.score) best = { weekday, block, score: s };
        }
      }
      if (!best) {
        const teacherCells = demand.teacherId
          ? (ctx.teacherBusy.get(demand.teacherId)?.size ?? 0)
          : 0;
        const reason = demand.teacherId
          ? teacherCells > 0
            ? `O professor ${demand.teacherName ?? ""} já não tem tempos livres compatíveis (ocupado noutras turmas em ${teacherCells} tempos).`
            : "Não há blocos livres no turno da turma."
          : "Não há blocos livres no turno da turma.";
        const existing = unplaced.find((u) => u.classSubjectId === demand.classSubjectId);
        if (existing) existing.missing = left;
        else unplaced.push({ classSubjectId: demand.classSubjectId, subjectName: demand.subjectName, missing: left, reason });
        remaining.set(demand.classSubjectId, 0);
        continue;
      }
      grid.set(blockKey(best.weekday, best.block.number), placementFor(ctx, demand, best.weekday, best.block));
      remaining.set(demand.classSubjectId, left - 1);
      progress = true;
    }
  }

  // 4. Melhoria local por trocas.
  improveBySwaps(ctx, grid);

  const placements = [...grid.values()].sort((a, b) => a.weekday - b.weekday || a.block - b.block);
  const metrics = computeMetrics(ctx, placements);

  // 5. Razões para movimentos: conflitos com o modelo anterior.
  if (input.previous?.length) {
    for (const prev of input.previous) {
      const demand = ctx.demandById.get(prev.classSubjectId);
      const block = ctx.blocksByNumber.get(prev.block);
      if (!demand) {
        reasons.set(prev.classSubjectId, "A disciplina já não faz parte da turma neste período.");
        continue;
      }
      if (!block) {
        reasons.set(prev.classSubjectId, "O bloco horário deixou de existir no turno.");
        continue;
      }
      const ck = cellKey(prev.weekday, block.startsAt);
      if (demand.teacherId && ctx.teacherBusy.get(demand.teacherId)?.has(ck)) {
        reasons.set(
          prev.classSubjectId,
          `O professor ${demand.teacherName ?? ""} passou a ter aula noutra turma em ${describeCell(prev.weekday, prev.block)}.`,
        );
      } else if (input.roomId && ctx.roomBusy.get(input.roomId)?.has(ck)) {
        reasons.set(prev.classSubjectId, `A sala passou a estar ocupada em ${describeCell(prev.weekday, prev.block)}.`);
      } else if (demand.teacherId && !teacherAvailable(input.teacherAvailability?.[demand.teacherId], prev.weekday, block)) {
        reasons.set(prev.classSubjectId, `O professor deixou de estar disponível em ${describeCell(prev.weekday, prev.block)}.`);
      }
    }
  }
  const changes = diffPlacements(input.previous, placements, ctx.demandById, reasons);

  const moved = changes.filter((c) => c.kind === "moved").length;
  const added = changes.filter((c) => c.kind === "added").length;
  const removed = changes.filter((c) => c.kind === "removed").length;
  if (input.previous?.length) {
    explanations.unshift(
      `Continuidade de ${metrics.continuity ?? 0}% face ao modelo anterior: ${moved} tempo(s) movido(s), ${added} novo(s), ${removed} retirado(s).`,
    );
  }
  if (unplaced.length) {
    explanations.push(
      `Ficaram por colocar ${unplaced.reduce((s, u) => s + u.missing, 0)} tempo(s) em ${unplaced.length} disciplina(s). Ajuste a carga, a disponibilidade dos professores ou os blocos do turno.`,
    );
  } else {
    explanations.push(`Carga semanal completa: ${metrics.filled} de ${metrics.required} tempos colocados sem conflitos.`);
  }
  if (metrics.doubles > 0) explanations.push(`${metrics.doubles} tempo(s) geminado(s) para disciplinas com mais carga.`);

  return { placements, unplaced, metrics, changes, explanations };
}

/** Valida uma grelha editada à mão: devolve conflitos (não bloqueia). */
export function validatePlacements(
  input: Omit<EngineInput, "demands"> & { demands: EngineDemand[] },
  placements: EnginePlacement[],
): Array<{ classSubjectId: string; weekday: number; block: number; message: string }> {
  const ctx = buildCtx({ ...input, previous: undefined, pinned: undefined });
  const issues: Array<{ classSubjectId: string; weekday: number; block: number; message: string }> = [];
  const seen = new Map<string, EnginePlacement>();
  for (const p of placements) {
    const d = ctx.demandById.get(p.classSubjectId);
    const b = ctx.blocksByNumber.get(p.block);
    if (!d || !b) continue;
    const bk = blockKey(p.weekday, p.block);
    if (seen.has(bk)) {
      issues.push({ ...p, message: "Duas disciplinas no mesmo tempo." });
      continue;
    }
    seen.set(bk, p);
    const ck = cellKey(p.weekday, b.startsAt);
    if (d.teacherId && ctx.teacherBusy.get(d.teacherId)?.has(ck)) {
      issues.push({ ...p, message: `${d.teacherName ?? "O professor"} já tem aula noutra turma neste tempo.` });
    }
    if (input.roomId && ctx.roomBusy.get(input.roomId)?.has(ck)) {
      issues.push({ ...p, message: "A sala está ocupada por outra turma neste tempo." });
    }
    if (d.teacherId && !teacherAvailable(input.teacherAvailability?.[d.teacherId], p.weekday, b)) {
      issues.push({ ...p, message: `${d.teacherName ?? "O professor"} não está disponível neste tempo.` });
    }
  }
  const counts = new Map<string, number>();
  for (const p of placements) counts.set(p.classSubjectId, (counts.get(p.classSubjectId) ?? 0) + 1);
  for (const d of input.demands) {
    const n = counts.get(d.classSubjectId) ?? 0;
    if (n > d.weeklyPeriods) {
      issues.push({ classSubjectId: d.classSubjectId, weekday: 0, block: 0, message: `${d.subjectName}: ${n} tempos marcados, a carga semanal é ${d.weeklyPeriods}.` });
    }
  }
  return issues;
}
