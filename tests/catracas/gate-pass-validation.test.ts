/**
 * tests/catracas/gate-pass-validation.test.ts
 *
 * Testa a função central evaluateGatePassAccess que controla a passagem
 * nas catracas. Usa um cliente Supabase simulado para não precisar de
 * ligação real à base de dados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateGatePassAccess,
  findGatePassCard,
  type GatePassCardRow,
  type GatePassDeviceContext,
} from "@/features/catracas/gate-pass-validation";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<GatePassCardRow> = {}): GatePassCardRow {
  return {
    id: "card-uuid-001",
    person_id: "person-uuid-001",
    student_id: "student-uuid-001",
    status: "active",
    card_number: "CARD-001",
    ...overrides,
  };
}

/**
 * Constrói um Supabase fake que retorna uma cadeia de query fluente.
 * A cadeia para siga_access_cards é: select().eq().eq().or().maybeSingle()
 * A cadeia para students é:           select().eq().eq().maybeSingle()
 * A cadeia para siga_access_logs é:   insert()
 */
function makeDb(options: {
  card?: GatePassCardRow | null;
  studentStatus?: string | null;
} = {}) {
  const { card = makeCard(), studentStatus = "active" } = options;

  // Builder fluente — cada método retorna `this` para encadeamento
  function makeQueryBuilder(finalValue: unknown) {
    const self: Record<string, unknown> = {};
    const chain = () => self;
    self.select = chain;
    self.eq = chain;
    self.or = chain;
    self.maybeSingle = async () => ({ data: finalValue, error: null });
    self.insert = vi.fn().mockResolvedValue({ error: null });
    return self;
  }

  const db = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "siga_access_cards") {
        return makeQueryBuilder(card);
      }
      if (table === "students") {
        const stuData =
          studentStatus != null ? { id: "student-uuid-001", status: studentStatus } : null;
        return makeQueryBuilder(stuData);
      }
      if (table === "siga_access_logs") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return makeQueryBuilder(null);
    }),
  } as any;

  return db;
}

const onlineDevice: GatePassDeviceContext = {
  deviceId: "device-001",
  deviceName: "Catraca Principal",
  blockPassage: false,
};

const offlineDevice: GatePassDeviceContext = {
  deviceId: "device-002",
  deviceName: "Catraca Manutenção",
  blockPassage: true,
};

const SCHOOL_ID = "school-uuid-001";
const TOKENS = ["CARD-001"];

// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateGatePassAccess — dispositivo offline", () => {
  it("bloqueia passagem quando dispositivo está em manutenção/offline", async () => {
    const db = makeDb();
    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", offlineDevice);

    expect(result.granted).toBe(false);
    expect(result.reason).toContain("offline ou em manutenção");
    // quando bloqueado por dispositivo, nem toca na BD
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("evaluateGatePassAccess — cartão não encontrado", () => {
  it("nega acesso quando cartão não é encontrado e regista log", async () => {
    const db = makeDb({ card: null });
    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", onlineDevice);

    expect(result.granted).toBe(false);
    expect(result.reason).toContain("não reconhecido");
  });
});

describe("evaluateGatePassAccess — cartão suspenso/inactivo", () => {
  it("nega acesso com cartão suspenso e mensagem clara", async () => {
    const db = makeDb({ card: makeCard({ status: "suspended" }) });
    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", onlineDevice);

    expect(result.granted).toBe(false);
    expect(result.reason).toContain("suspenso");
  });

  it("nega acesso com cartão inactivo (status ≠ 'active')", async () => {
    const db = makeDb({ card: makeCard({ status: "inactive" }) });
    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", onlineDevice);

    expect(result.granted).toBe(false);
    expect(result.reason).toContain("inactivo");
  });

  it("nega acesso com cartão 'cancelled'", async () => {
    const db = makeDb({ card: makeCard({ status: "cancelled" }) });
    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", onlineDevice);

    expect(result.granted).toBe(false);
  });
});

describe("evaluateGatePassAccess — aluno inactivo (cartão activo)", () => {
  it("nega acesso quando aluno está inactivo mesmo com cartão activo", async () => {
    const db = makeDb({ card: makeCard({ status: "active" }), studentStatus: "inactive" });

    vi.doMock("@/features/people/lookup", () => ({
      loadPeopleLite: async () => new Map(),
    }));

    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", onlineDevice);

    expect(result.granted).toBe(false);
    expect(result.reason).toContain("aluno inactivo");
  });
});

describe("evaluateGatePassAccess — acesso concedido", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("concede entrada com cartão activo e aluno activo", async () => {
    const db = makeDb({ card: makeCard({ status: "active" }), studentStatus: "active" });

    vi.doMock("@/features/people/lookup", () => ({
      loadPeopleLite: async () =>
        new Map([["person-uuid-001", { full_name: "Ana Domingos", photo_url: null }]]),
    }));

    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", onlineDevice);

    expect(result.granted).toBe(true);
    expect(result.direction).toBe("entry");
    expect(result.cardNumber).toBe("CARD-001");
    expect(result.studentId).toBe("student-uuid-001");
    expect(result.timestamp).toBeTruthy();
  });

  it("concede saída com cartão activo e aluno activo", async () => {
    const db = makeDb({ card: makeCard({ status: "active" }), studentStatus: "active" });

    vi.doMock("@/features/people/lookup", () => ({
      loadPeopleLite: async () =>
        new Map([["person-uuid-001", { full_name: "Ana Domingos", photo_url: "/foto.jpg" }]]),
    }));

    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "exit", onlineDevice);

    expect(result.granted).toBe(true);
    expect(result.direction).toBe("exit");
    expect(result.personId).toBe("person-uuid-001");
  });

  it("concede acesso a cartão de staff sem student_id", async () => {
    const db = makeDb({
      card: makeCard({ status: "active", student_id: null }),
    });

    vi.doMock("@/features/people/lookup", () => ({
      loadPeopleLite: async () =>
        new Map([["person-uuid-001", { full_name: "Carlos Silva", photo_url: null }]]),
    }));

    const result = await evaluateGatePassAccess(db, SCHOOL_ID, TOKENS, "entry", onlineDevice);

    expect(result.granted).toBe(true);
    expect(result.studentId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("findGatePassCard", () => {
  it("retorna o cartão quando token coincide", async () => {
    const cardData = makeCard({ card_number: "RFID-ABC" });
    const db = makeDb({ card: cardData });

    const result = await findGatePassCard(db, SCHOOL_ID, ["RFID-ABC"]);
    expect(result?.card_number).toBe("RFID-ABC");
  });

  it("retorna null quando nenhum token coincide", async () => {
    const db = makeDb({ card: null });
    const result = await findGatePassCard(db, SCHOOL_ID, ["TOKEN-INEXISTENTE"]);
    expect(result).toBeNull();
  });

  it("tenta múltiplos tokens em sequência", async () => {
    const db = makeDb({ card: null });
    const result = await findGatePassCard(db, SCHOOL_ID, ["TOKEN-A", "TOKEN-B", "TOKEN-C"]);
    expect(result).toBeNull();
    // deve ter chamado from() uma vez por token
    expect(db.from).toHaveBeenCalledTimes(3);
  });
});
