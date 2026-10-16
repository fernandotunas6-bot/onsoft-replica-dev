import { env, applyD1Migrations } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv, User } from "../src/app-env";
import grades from "../src/api/grades";

const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
	c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
	await next();
});
app.route("/grades", grades);

const admin: User = { uid: "adm", schoolId: "g1", role: "admin" };
const call = (path: string, init: RequestInit = {}) =>
	app.request(path, { ...init, headers: { "Content-Type": "application/json", "X-Test-User": JSON.stringify(admin) } }, env);
const put = (body: unknown) => call("/grades", { method: "PUT", body: JSON.stringify(body) });
type Rows = { data: { subject_id: string; class_score: number; exam_score: number; academic_year: string }[]; academic_year: string };

beforeAll(async () => {
	const all = env.TEST_MIGRATIONS;
	const upTo = all.findIndex((m) => m.name.startsWith("0015"));
	// Estado antes da 0015: notas sem ano lectivo.
	await applyD1Migrations(env.DB, all.slice(0, upTo));
	await env.DB.batch(
		[
			`INSERT INTO Schools (id, name, academic_calendar_json) VALUES ('g1', 'G', '{"academic_year":"2025/2026","terms":[]}'), ('g2', 'Sem calendário', NULL)`,
			"INSERT INTO Classes (id, school_id, class_name) VALUES ('gc', 'g1', 'C'), ('gc2', 'g2', 'C')",
			"INSERT INTO Subjects (id, school_id, name) VALUES ('gm', 'g1', 'Matemática'), ('gm2', 'g2', 'Matemática')",
			"INSERT INTO Students (id, school_id, class_id, name) VALUES ('gs', 'g1', 'gc', 'Ana'), ('gs2', 'g2', 'gc2', 'Rui')",
			"INSERT INTO Enrollments (id, school_id, student_id, subject_id, term_id, class_score, exam_score) VALUES ('old1', 'g1', 'gs', 'gm', 'Term 1', 20, 50), ('old2', 'g2', 'gs2', 'gm2', 'Term 1', 10, 30)",
		].map((sql) => env.DB.prepare(sql)),
	);
	await applyD1Migrations(env.DB, all);
});

describe("notas por ano lectivo", () => {
	it("a migração põe as notas antigas no ano actual de cada escola", async () => {
		const { results } = await env.DB.prepare("SELECT id, academic_year FROM Enrollments ORDER BY id").all<{ id: string; academic_year: string }>();
		expect(results).toEqual([
			{ id: "old1", academic_year: "2025/2026" },
			{ id: "old2", academic_year: "" },
		]);
	});

	it("sem ano pedido, lê e grava no ano actual", async () => {
		const read = (await (await call("/grades?student_id=gs&term=Term%201")).json()) as Rows;
		expect(read.academic_year).toBe("2025/2026");
		expect(read.data).toEqual([expect.objectContaining({ subject_id: "gm", class_score: 20, exam_score: 50 })]);

		expect((await put({ student_id: "gs", term: "Term 1", grades: [{ subject_id: "gm", class_score: 25, exam_score: 60 }] })).status).toBe(200);
		const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM Enrollments WHERE student_id = 'gs'").all<{ n: number }>();
		expect(results[0].n).toBe(1);
	});

	it("outro ano não escreve por cima", async () => {
		expect((await put({ student_id: "gs", term: "Term 1", academic_year: "2026/2027", grades: [{ subject_id: "gm", class_score: 10, exam_score: 20 }] })).status).toBe(200);
		const next = (await (await call("/grades?student_id=gs&term=Term%201&academic_year=2026/2027")).json()) as Rows;
		const current = (await (await call("/grades?student_id=gs&term=Term%201")).json()) as Rows;
		expect(next.data[0]).toMatchObject({ class_score: 10, exam_score: 20, academic_year: "2026/2027" });
		expect(current.data[0]).toMatchObject({ class_score: 25, exam_score: 60, academic_year: "2025/2026" });
	});
});

describe("anos com notas", () => {
	it("devolve o actual e os anos com notas, mais recente primeiro", async () => {
		const res = await call("/grades/years?student_id=gs");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: ["2026/2027", "2025/2026"], current: "2025/2026" });
		expect((await call("/grades/years?student_id=nao-existe")).status).toBe(404);
	});
});
