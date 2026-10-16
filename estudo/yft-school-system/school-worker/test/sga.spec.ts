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
	schools: [{ id: S1, name: "Escola Um", currency_code: "AOA" }, { id: S2, name: "Escola Dois", currency_code: "AOA" }],
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
	profiles: [{ id: "u-guardian", full_name: "Mariana Silva", display_name: null }],
	roles: [{ id: "r-g", code: "encarregado" }, { id: "r-t", code: "professor" }],
	people: [
		{ id: "p-prof", school_id: S1, full_name: "Carlos Mendes", preferred_name: null, deleted_at: null },
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
		{ id: "e-ana", school_id: S1, student_id: "st-ana", class_group_id: "cg-10a", status: "active", academic_year_id: "ay-1" },
		{ id: "e-ana-old", school_id: S1, student_id: "st-ana", class_group_id: "cg-9a", status: "completed", academic_year_id: "ay-0" },
		{ id: "e-rui", school_id: S1, student_id: "st-rui", class_group_id: "cg-7b", status: "active", academic_year_id: "ay-1" },
	],
	class_groups: [
		{ id: "cg-10a", school_id: S1, name: "10.ª A" },
		{ id: "cg-9a", school_id: S1, name: "9.ª A" },
		{ id: "cg-7b", school_id: S1, name: "7.ª B" },
	],
	class_subjects: [
		{ id: "cs-mat", school_id: S1, class_group_id: "cg-10a", subject_id: "sub-mat", teacher_id: "t-1" },
		{ id: "cs-por", school_id: S1, class_group_id: "cg-10a", subject_id: "sub-por", teacher_id: null },
		{ id: "cs-other", school_id: S1, class_group_id: "cg-7b", subject_id: "sub-mat", teacher_id: "t-1" },
		{ id: "cs-9a", school_id: S1, class_group_id: "cg-9a", subject_id: "sub-mat", teacher_id: null },
		{ id: "cs-fis", school_id: S1, class_group_id: "cg-10a", subject_id: "sub-fis", teacher_id: null },
	],
	subjects: [
		{ id: "sub-mat", school_id: S1, name: "Matemática" },
		{ id: "sub-por", school_id: S1, name: "Português" },
		{ id: "sub-fis", school_id: S1, name: "Física" },
	],
	teachers: [{ id: "t-1", school_id: S1, person_id: "p-prof" }],
	timetable_slots: [
		{ id: "ts-1", school_id: S1, class_subject_id: "cs-mat", weekday: 1, starts_at: "07:30:00", ends_at: "08:15:00", room: "Sala 3", status: "active" },
		{ id: "ts-2", school_id: S1, class_subject_id: "cs-por", weekday: 2, starts_at: "08:20:00", ends_at: "09:05:00", room: null, status: "active" },
		{ id: "ts-old", school_id: S1, class_subject_id: "cs-mat", weekday: 3, starts_at: "10:00:00", ends_at: "10:45:00", room: null, status: "archived" },
		{ id: "ts-7b", school_id: S1, class_subject_id: "cs-other", weekday: 1, starts_at: "07:30:00", ends_at: "08:15:00", room: null, status: "active" },
	],
	siga_attendance_sessions: [
		{ id: "ss-1", school_id: S1, lesson_date: "2026-10-05" },
		{ id: "ss-2", school_id: S1, lesson_date: "2026-10-05" },
		{ id: "ss-3", school_id: S1, lesson_date: "2026-10-06" },
		{ id: "ss-4", school_id: S1, lesson_date: "2026-10-07" },
		{ id: "ss-5", school_id: S1, lesson_date: "2026-10-08" },
	],
	siga_attendance_records: [
		{ school_id: S1, session_id: "ss-1", student_id: "st-ana", status: "present" },
		{ school_id: S1, session_id: "ss-2", student_id: "st-ana", status: "absent" },
		{ school_id: S1, session_id: "ss-3", student_id: "st-ana", status: "late" },
		{ school_id: S1, session_id: "ss-4", student_id: "st-ana", status: "excused" },
		{ school_id: S1, session_id: "ss-5", student_id: "st-ana", status: "not_registered" },
		{ school_id: S1, session_id: "ss-3", student_id: "st-rui", status: "absent" },
	],
	finance_contracts: [{ id: "fc-rui", school_id: S1, enrollment_id: "e-rui" }],
	finance_invoices: [
		{ id: "fi-1", school_id: S1, contract_id: "fc-rui", status: "open", due_date: "2000-01-01", fee_item_id: "fee-prop", invoice_number: "F-7", competence_month: "2026-10-01", amount: 20000, discount_amount: 2000, penalty_amount: 1000 },
	],
	finance_receipts: [
		{ id: "fr-2", school_id: S1, invoice_id: "fi-1", receipt_number: "R-2", amount: 5000, paid_on: "2026-10-12", created_at: "2026-10-12T09:00:00Z", reversed_at: null },
		{ id: "fr-1", school_id: S1, invoice_id: "fi-1", receipt_number: "R-1", amount: 10000, paid_on: "2026-10-05", created_at: "2026-10-05T09:00:00Z", reversed_at: null },
		{ id: "fr-x", school_id: S1, invoice_id: "fi-1", receipt_number: "R-X", amount: 999, paid_on: "2026-10-06", created_at: "2026-10-06T09:00:00Z", reversed_at: "2026-10-07" },
	],
	fee_items: [{ id: "fee-prop", school_id: S1, name: "Propina" }],
	academic_years: [
		{ id: "ay-1", school_id: S1, name: "2026/2027", status: "active", starts_on: "2026-09-01" },
		{ id: "ay-0", school_id: S1, name: "2025/2026", status: "closed", starts_on: "2025-09-01" },
	],
	terms: [
		{ id: "t1-26", school_id: S1, academic_year_id: "ay-1", sequence: 1 },
		{ id: "t2-26", school_id: S1, academic_year_id: "ay-1", sequence: 2 },
		{ id: "t1-25", school_id: S1, academic_year_id: "ay-0", sequence: 1 },
	],
	gradebooks: [
		{ id: "gb-mat", school_id: S1, class_group_id: "cg-10a", class_subject_id: "cs-mat", term_id: "t1-26", status: "open" },
		{ id: "gb-por", school_id: S1, class_group_id: "cg-10a", class_subject_id: "cs-por", term_id: "t1-26", status: "closed" },
		{ id: "gb-mat-t2", school_id: S1, class_group_id: "cg-10a", class_subject_id: "cs-mat", term_id: "t2-26", status: "open" },
		{ id: "gb-old", school_id: S1, class_group_id: "cg-9a", class_subject_id: "cs-9a", term_id: "t1-25", status: "closed" },
	],
	grade_items: [
		{ id: "gi-mac", school_id: S1, gradebook_id: "gb-mat", code: "MAC" },
		{ id: "gi-npp", school_id: S1, gradebook_id: "gb-mat", code: "NPP" },
		{ id: "gi-npt", school_id: S1, gradebook_id: "gb-mat", code: "NPT" },
		{ id: "gi-por-mac", school_id: S1, gradebook_id: "gb-por", code: "mac" },
		{ id: "gi-t2", school_id: S1, gradebook_id: "gb-mat-t2", code: "MAC" },
		{ id: "gi-old", school_id: S1, gradebook_id: "gb-old", code: "NPT" },
	],
	grade_scores: [
		{ school_id: S1, enrollment_id: "e-ana", grade_item_id: "gi-mac", score: 12.5 },
		{ school_id: S1, enrollment_id: "e-ana", grade_item_id: "gi-npp", score: 9 },
		{ school_id: S1, enrollment_id: "e-ana", grade_item_id: "gi-npt", score: 14 },
		{ school_id: S1, enrollment_id: "e-ana", grade_item_id: "gi-por-mac", score: 11 },
		{ school_id: S1, enrollment_id: "e-ana", grade_item_id: "gi-t2", score: 16 },
		{ school_id: S1, enrollment_id: "e-ana-old", grade_item_id: "gi-old", score: 18 },
		{ school_id: S1, enrollment_id: "e-outro", grade_item_id: "gi-mac", score: 2 },
	],
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
		case "neq": return String(cell) !== val;
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
		expect(me).toMatchObject({ name: "Mariana Silva", school: { id: S1, name: "Escola Um" }, role: "parent", roles: ["Encarregado"] });
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
			{ id: "st-ana", school_id: S1, class_id: "cg-10a", class_name: "10.ª A", name: "Ana Silva", photo_url: null, student_number: "A1", enrollment_id: "e-ana", is_active: 1 },
			{ id: "st-rui", school_id: S1, class_id: "cg-7b", class_name: "7.ª B", name: "Rui", photo_url: "https://x/rui.jpg", student_number: "A2", enrollment_id: "e-rui", is_active: 1 },
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
		expect(data.find((n) => n.id === "n-debt")).toMatchObject({ school_id: S1, category: "finance", summary: "x", read_flag: 0, created_at: "2026-10-02" });
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

	it("/timetable: só tempos activos da turma de um educando, com disciplina e professor", async () => {
		const { data } = (await (await get("/timetable?class_id=cg-10a", "tok-guardian")).json()) as { data: Record<string, unknown>[] };
		expect(data).toEqual([
			{ id: "ts-1", class_id: "cg-10a", class_name: "10.ª A", subject_id: "sub-mat", subject_name: "Matemática", title: null, weekday: 1, start_time: "07:30", end_time: "08:15", room: "Sala 3", teacher_name: "Carlos Mendes", teacher_uid: null },
			{ id: "ts-2", class_id: "cg-10a", class_name: "10.ª A", subject_id: "sub-por", subject_name: "Português", title: null, weekday: 2, start_time: "08:20", end_time: "09:05", room: null, teacher_name: null, teacher_uid: null },
		]);
		// Turma que não é de nenhum educando desta conta.
		expect((await get("/timetable?class_id=cg-9a", "tok-email")).status).toBe(404);
		expect((await get("/timetable", "tok-teacher")).status).toBe(403);
	});

	it("/attendance: dias com falta e dias de presença; outro aluno é 404", async () => {
		const res = await get("/attendance/student/st-ana", "tok-guardian");
		expect(await res.json()).toEqual({ present_days: 2, absent_days: 1, absences: ["2026-10-05"] });
		expect((await get("/attendance/student/st-other", "tok-guardian")).status).toBe(404);
		expect((await get("/attendance/student/st-rui", "tok-email")).status).toBe(404);
	});

	it("/finance/receipts: recibos não anulados, com o que falta da factura depois de cada um", async () => {
		const { data } = (await (await get("/finance/receipts", "tok-guardian")).json()) as { data: Record<string, unknown>[] };
		// Factura: 20 000 − 2 000 + 1 000 = 19 000.
		expect(data).toEqual([
			{ id: "fr-2", school_id: S1, student_id: "st-rui", parent_uid: null, transaction_id: "R-2", amount_paid: 5000, balance_before: 9000, balance_after: 4000, amount_to_debt: 5000, credit_added: 0, currency: "AOA", student_name: "Rui", description: "Propina · Outubro (factura F-7)", created_at: "2026-10-12", academic_year: "2026/2027", fee_term: null },
			{ id: "fr-1", school_id: S1, student_id: "st-rui", parent_uid: null, transaction_id: "R-1", amount_paid: 10000, balance_before: 19000, balance_after: 9000, amount_to_debt: 10000, credit_added: 0, currency: "AOA", student_name: "Rui", description: "Propina · Outubro (factura F-7)", created_at: "2026-10-05", academic_year: "2026/2027", fee_term: null },
		]);
		const none = (await (await get("/finance/receipts", "tok-email")).json()) as { data: unknown[] };
		expect(none.data).toEqual([]);
	});

	it("/grades: MAC/NPP/NPT e MT (MAC+NPT)/2 do trimestre, todas as disciplinas da turma", async () => {
		const body = (await (await get("/grades?student_id=st-ana&term=Term%201", "tok-guardian")).json()) as Record<string, unknown>;
		expect(body).toEqual({
			academic_year: "2026/2027",
			scale: 20,
			data: [
				{ subject_id: "sub-fis", subject_name: "Física", mac: null, npp: null, npt: null, mt: null, provisional: false },
				// (12,5 + 14) / 2 = 13,25 → 13,3; diário aberto: provisória.
				{ subject_id: "sub-mat", subject_name: "Matemática", mac: 12.5, npp: 9, npt: 14, mt: 13.3, provisional: true },
				// Só MAC: a MT é a MAC; diário fechado.
				{ subject_id: "sub-por", subject_name: "Português", mac: 11, npp: null, npt: null, mt: 11, provisional: false },
			],
		});
		const t2 = (await (await get("/grades?student_id=st-ana&term=Term%202", "tok-guardian")).json()) as { data: { subject_id: string; mt: number | null }[] };
		expect(t2.data.find((l) => l.subject_id === "sub-mat")?.mt).toBe(16);
	});

	it("/grades: ano anterior pela turma desse ano; anos lectivos com o actual", async () => {
		const old = (await (await get("/grades?student_id=st-ana&term=Term%201&academic_year=2025%2F2026", "tok-guardian")).json()) as { academic_year: string; data: { subject_id: string; npt: number | null; mt: number | null }[] };
		expect(old.academic_year).toBe("2025/2026");
		expect(old.data).toEqual([expect.objectContaining({ subject_id: "sub-mat", npt: 18, mt: 18, provisional: false })]);
		const years = await (await get("/grades/years?student_id=st-ana", "tok-guardian")).json();
		expect(years).toEqual({ data: ["2026/2027", "2025/2026"], current: "2026/2027" });
	});

	it("/grades: só educandos e trimestres válidos", async () => {
		expect((await get("/grades?student_id=st-other&term=Term%201", "tok-guardian")).status).toBe(404);
		expect((await get("/grades?student_id=st-ana&term=1", "tok-guardian")).status).toBe(422);
		expect((await get("/grades/years?student_id=st-rui", "tok-email")).status).toBe(404);
		expect((await get("/grades?student_id=st-ana&term=Term%201", "tok-teacher")).status).toBe(403);
	});
});
