import { env } from "cloudflare:test";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sga from "../src/api/sga";

// Supabase falso: Auth (/auth/v1/user) e um PostgREST mínimo em memória, que
// aplica eq/in/is/lt/gte/or a sério — se uma consulta esquecer o filtro da
// escola, os dados da outra escola aparecem e os testes falham.
type Row = Record<string, unknown>;
const URL_BASE = "https://sga.test";
const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const tables: Record<string, Row[]> = {
	schools: [{ id: S1, name: "Escola Um" }, { id: S2, name: "Escola Dois" }],
	school_memberships: [
		{ id: "m-g", school_id: S1, user_id: "u-guardian", status: "active", created_at: "1" },
		{ id: "m-g2", school_id: S2, user_id: "u-guardian", status: "active", created_at: "2" },
		{ id: "m-t", school_id: S1, user_id: "u-teacher", status: "active", created_at: "1" },
		{ id: "m-old", school_id: S1, user_id: "u-gone", status: "suspended", created_at: "1" },
		{ id: "m-e", school_id: S1, user_id: "u-email", status: "active", created_at: "1" },
	],
	member_roles: [
		{ membership_id: "m-g", role_id: "r-g" },
		{ membership_id: "m-g2", role_id: "r-g" },
		{ membership_id: "m-t", role_id: "r-t" },
		{ membership_id: "m-e", role_id: "r-g" },
	],
	roles: [{ id: "r-g", code: "encarregado" }, { id: "r-t", code: "professor" }],
	people: [
		{ id: "p-g", school_id: S1, user_id: "u-guardian", email: null, deleted_at: null, full_name: "Mariana" },
		{ id: "p-g2", school_id: S2, user_id: "u-guardian", email: null, deleted_at: null, full_name: "Mariana" },
		{ id: "p-e", school_id: S1, user_id: null, email: "pai@ex.ao", deleted_at: null, full_name: "Pai" },
		{ id: "p-ana", school_id: S1, full_name: "Ana Silva", preferred_name: null, photo_url: null, deleted_at: null },
		{ id: "p-rui", school_id: S1, full_name: "Rui Silva", preferred_name: "Rui", photo_url: "https://x/rui.jpg", deleted_at: null },
		{ id: "p-old", school_id: S1, full_name: "Antigo", deleted_at: null },
		{ id: "p-other", school_id: S2, full_name: "Da Outra Escola", deleted_at: null },
	],
	students: [
		{ id: "st-ana", school_id: S1, person_id: "p-ana", student_number: "A1", deleted_at: null },
		{ id: "st-rui", school_id: S1, person_id: "p-rui", student_number: "A2", deleted_at: null },
		{ id: "st-old", school_id: S1, person_id: "p-old", student_number: "A3", deleted_at: null },
		{ id: "st-other", school_id: S2, person_id: "p-other", student_number: "B1", deleted_at: null },
	],
	student_guardians: [
		{ school_id: S1, student_id: "st-ana", guardian_person_id: "p-g", valid_until: null },
		{ school_id: S1, student_id: "st-rui", guardian_person_id: "p-g", valid_until: "2999-01-01" },
		{ school_id: S1, student_id: "st-old", guardian_person_id: "p-g", valid_until: "2000-01-01" },
		{ school_id: S2, student_id: "st-other", guardian_person_id: "p-g2", valid_until: null },
		{ school_id: S1, student_id: "st-ana", guardian_person_id: "p-e", valid_until: null },
	],
	enrollments: [
		{ id: "e-ana", school_id: S1, student_id: "st-ana", class_group_id: "cg-10a", status: "active" },
		{ id: "e-ana-old", school_id: S1, student_id: "st-ana", class_group_id: "cg-9a", status: "completed" },
		{ id: "e-rui", school_id: S1, student_id: "st-rui", class_group_id: "cg-7b", status: "active" },
	],
	class_groups: [
		{ id: "cg-10a", school_id: S1, name: "10.ª A" },
		{ id: "cg-9a", school_id: S1, name: "9.ª A" },
		{ id: "cg-7b", school_id: S1, name: "7.ª B" },
	],
	finance_contracts: [{ id: "fc-rui", school_id: S1, enrollment_id: "e-rui" }],
	finance_invoices: [{ id: "fi-1", school_id: S1, contract_id: "fc-rui", status: "open", due_date: "2000-01-01" }],
	school_announcements: [
		{ id: "n-all", school_id: S1, title: "Reunião", body: "x", audience: "all_guardians", status: "sent", deleted_at: null, published_at: "2026-10-01", created_at: "2026-10-01" },
		{ id: "n-debt", school_id: S1, title: "Propinas", body: "x", audience: "guardians_with_debt", status: "sent", deleted_at: null, published_at: "2026-10-02", created_at: "2026-10-02" },
		{ id: "n-staff", school_id: S1, title: "Só professores", body: "x", audience: "teachers", status: "sent", deleted_at: null, published_at: "2026-10-03", created_at: "2026-10-03" },
		{ id: "n-draft", school_id: S1, title: "Rascunho", body: "x", audience: "all_guardians", status: "draft", deleted_at: null, published_at: null, created_at: "2026-10-04" },
		{ id: "n-s2", school_id: S2, title: "Outra escola", body: "x", audience: "all_guardians", status: "sent", deleted_at: null, published_at: "2026-10-05", created_at: "2026-10-05" },
	],
};
const sessions: Record<string, Row> = {
	"tok-guardian": { id: "u-guardian", email: "mariana@ex.ao", email_confirmed_at: "2026-01-01" },
	"tok-teacher": { id: "u-teacher", email: "prof@ex.ao", email_confirmed_at: "2026-01-01" },
	"tok-gone": { id: "u-gone", email: "x@ex.ao", email_confirmed_at: "2026-01-01" },
	"tok-email": { id: "u-email", email: "PAI@ex.ao", email_confirmed_at: "2026-01-01" },
	"tok-email-unconfirmed": { id: "u-email", email: "pai@ex.ao", email_confirmed_at: null },
};
const SECRET = "sb_secret_test";
const seen: string[] = [];

const unquote = (v: string) => v.replace(/^"|"$/g, "");
function matches(row: Row, key: string, expr: string): boolean {
	const dot = expr.indexOf(".");
	const op = expr.slice(0, dot);
	const val = expr.slice(dot + 1);
	const cell = row[key];
	switch (op) {
		case "eq": return String(cell) === val;
		case "is": return val === "null" ? cell == null : String(cell) === val;
		case "in": return val.slice(1, -1).split(",").map(unquote).includes(String(cell));
		case "lt": return cell != null && String(cell) < val;
		case "gte": return cell != null && String(cell) >= val;
		default: throw new Error(`op ${op}`);
	}
}
function orMatches(row: Row, expr: string): boolean {
	return expr.slice(1, -1).split(",").some((part) => {
		const [key, ...rest] = part.split(".");
		return matches(row, key, rest.join("."));
	});
}
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
	const headers = new Headers(init?.headers);
	if (url.pathname === "/auth/v1/user") {
		const token = headers.get("Authorization")?.replace("Bearer ", "") ?? "";
		const s = sessions[token];
		return s ? Response.json(s) : new Response("{}", { status: 401 });
	}
	if (headers.get("apikey") !== SECRET) return new Response("{}", { status: 401 });
	const table = url.pathname.replace("/rest/v1/", "");
	seen.push(table);
	let rows = [...(tables[table] ?? [])];
	for (const [k, v] of url.searchParams) {
		if (["select", "order", "limit"].includes(k)) continue;
		rows = k === "or" ? rows.filter((r) => orMatches(r, v)) : rows.filter((r) => matches(r, k, v));
	}
	if (table === "member_roles") {
		rows = rows.map((r) => ({ ...r, roles: tables.roles.find((x) => x.id === r.role_id) ?? null }));
	}
	const limit = url.searchParams.get("limit");
	return Response.json(limit ? rows.slice(0, Number(limit)) : rows);
}

const app = new Hono();
app.route("/api/sga", sga);
const sgaEnv = { ...env, SGA_SUPABASE_URL: URL_BASE, SGA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SGA_SUPABASE_SECRET_KEY: SECRET };
const get = (path: string, token?: string, school?: string) =>
	app.request(`/api/sga${path}`, {
		headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(school ? { "X-School-Id": school } : {}) },
	}, sgaEnv);

beforeAll(() => vi.stubGlobal("fetch", fakeFetch));
afterAll(() => vi.unstubAllGlobals());

describe("API SGA", () => {
	it("sem sessão, sessão inválida ou sem vínculo activo", async () => {
		expect((await get("/me")).status).toBe(401);
		expect((await get("/me", "tok-falso")).status).toBe(401);
		expect((await get("/me", "tok-gone")).status).toBe(403);
	});

	it("sem configuração responde 503 sem tentar ler", async () => {
		const res = await app.request("/api/sga/me", { headers: { Authorization: "Bearer tok-guardian" } }, env);
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "SGA_NOT_CONFIGURED" });
	});

	it("/me: escola, papel e as outras escolas; a escola pedida só vale se tiver vínculo", async () => {
		const me = (await (await get("/me", "tok-guardian")).json()) as Record<string, unknown>;
		expect(me).toMatchObject({ school: { id: S1, name: "Escola Um" }, role: "parent", roles: ["Encarregado"] });
		expect((me.schools as unknown[]).length).toBe(2);
		const other = (await (await get("/me", "tok-guardian", S2)).json()) as { school: { id: string } };
		expect(other.school.id).toBe(S2);
		const teacher = (await (await get("/me", "tok-teacher", S2)).json()) as { school: { id: string }; role: string };
		expect(teacher).toMatchObject({ school: { id: S1 }, role: "teacher" });
	});

	it("/wards: só educandos com ligação em vigor, desta escola, com a turma activa", async () => {
		const res = await get("/wards", "tok-guardian");
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
		const { data } = (await res.json()) as { data: Record<string, unknown>[] };
		expect(data).toEqual([
			{ id: "st-ana", name: "Ana Silva", studentNumber: "A1", photoUrl: null, enrollmentId: "e-ana", classGroupId: "cg-10a", className: "10.ª A" },
			{ id: "st-rui", name: "Rui", studentNumber: "A2", photoUrl: "https://x/rui.jpg", enrollmentId: "e-rui", classGroupId: "cg-7b", className: "7.ª B" },
		]);
		const s2 = (await (await get("/wards", "tok-guardian", S2)).json()) as { data: { id: string }[] };
		expect(s2.data.map((w) => w.id)).toEqual(["st-other"]);
	});

	it("liga pela ficha com o e-mail só quando está confirmado", async () => {
		const ok = (await (await get("/wards", "tok-email")).json()) as { data: { id: string }[] };
		expect(ok.data.map((w) => w.id)).toEqual(["st-ana"]);
		const no = (await (await get("/wards", "tok-email-unconfirmed")).json()) as { data: unknown[] };
		expect(no.data).toEqual([]);
	});

	it("/wards e /notices são só para encarregados", async () => {
		expect((await get("/wards", "tok-teacher")).status).toBe(403);
		expect((await get("/notices", "tok-teacher")).status).toBe(403);
	});

	it("/notices: publicados para encarregados, os de dívida só com factura vencida, só desta escola", async () => {
		const { data } = (await (await get("/notices", "tok-guardian")).json()) as { data: { id: string }[] };
		expect(data.map((n) => n.id).sort()).toEqual(["n-all", "n-debt"]);
		const noDebt = (await (await get("/notices", "tok-email")).json()) as { data: { id: string }[] };
		expect(noDebt.data.map((n) => n.id)).toEqual(["n-all"]);
	});

	it("uma leitura falhada é erro, nunca lista vazia", async () => {
		const original = tables.students;
		vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
			String(input).includes("/rest/v1/students") ? new Response("boom", { status: 500 }) : fakeFetch(input, init));
		try {
			const res = await get("/wards", "tok-guardian");
			expect(res.status).toBe(503);
			expect(await res.json()).toEqual({ error: "SGA_READ_FAILED" });
		} finally {
			tables.students = original;
			vi.stubGlobal("fetch", fakeFetch);
		}
	});
});
