import { env, applyD1Migrations } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv, User } from "../src/app-env";
import attendance from "../src/api/attendance";

const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
	c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
	await next();
});
app.route("/attendance", attendance);

const teacher: User = { uid: "t", schoolId: "a1", role: "teacher" };
const parent: User = { uid: "p", schoolId: "a1", role: "parent" };
const otherParent: User = { uid: "p2", schoolId: "a1", role: "parent" };
const stranger: User = { uid: "x", schoolId: "a2", role: "admin" };

const call = (u: User, path: string, init: RequestInit = {}) =>
	app.request(path, { ...init, headers: { "Content-Type": "application/json", "X-Test-User": JSON.stringify(u) } }, env);
const put = (u: User, body: unknown) => call(u, "/attendance", { method: "PUT", body: JSON.stringify(body) });

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await env.DB.batch(
		[
			"INSERT OR IGNORE INTO Schools (id, name) VALUES ('a1', 'A'), ('a2', 'B')",
			"INSERT OR IGNORE INTO Users (uid, school_id, role, name) VALUES ('p', 'a1', 'parent', 'P'), ('p2', 'a1', 'parent', 'P2')",
			"INSERT OR IGNORE INTO Classes (id, school_id, class_name, level) VALUES ('k1', 'a1', 'K1', 1), ('k2', 'a1', 'K2', 2)",
			"INSERT OR IGNORE INTO Students (id, school_id, class_id, parent_uid, name) VALUES ('s1', 'a1', 'k1', 'p', 'Bruno'), ('s2', 'a1', 'k1', NULL, 'Ana'), ('s3', 'a1', 'k2', NULL, 'Zé')",
			"INSERT OR IGNORE INTO Students (id, school_id, class_id, name, is_active) VALUES ('s4', 'a1', 'k1', 'Inactivo', 0)",
		].map((sql) => env.DB.prepare(sql)),
	);
});

describe("presenças", () => {
	it("lista a turma por ordem, sem inactivos, ainda por marcar", async () => {
		const body = (await (await call(teacher, "/attendance?class_id=k1&date=2026-03-02")).json()) as { data: { name: string; present: boolean | null }[]; marked: boolean };
		expect(body.data.map((r) => r.name)).toEqual(["Ana", "Bruno"]);
		expect(body.data.every((r) => r.present === null)).toBe(true);
		expect(body.marked).toBe(false);
	});

	it("grava e volta a gravar o mesmo dia sem duplicar", async () => {
		expect((await put(teacher, { class_id: "k1", date: "2026-03-02", records: [{ student_id: "s1", present: false }, { student_id: "s2", present: true }] })).status).toBe(200);
		expect((await put(teacher, { class_id: "k1", date: "2026-03-02", records: [{ student_id: "s1", present: true }] })).status).toBe(200);
		expect((await put(teacher, { class_id: "k1", date: "2026-03-03", records: [{ student_id: "s1", present: false }] })).status).toBe(200);
		const body = (await (await call(teacher, "/attendance?class_id=k1&date=2026-03-02")).json()) as { data: { student_id: string; present: boolean }[]; marked: boolean };
		expect(body.marked).toBe(true);
		expect(Object.fromEntries(body.data.map((r) => [r.student_id, r.present]))).toEqual({ s1: true, s2: true });
	});

	it("recusa alunos de outra turma, inactivos, datas futuras e o encarregado", async () => {
		expect((await put(teacher, { class_id: "k1", date: "2026-03-02", records: [{ student_id: "s3", present: true }] })).status).toBe(400);
		expect((await put(teacher, { class_id: "k1", date: "2026-03-02", records: [{ student_id: "s4", present: true }] })).status).toBe(400);
		expect((await put(teacher, { class_id: "k1", date: "2999-01-01", records: [{ student_id: "s1", present: true }] })).status).toBe(400);
		expect((await put(parent, { class_id: "k1", date: "2026-03-02", records: [{ student_id: "s1", present: true }] })).status).toBe(403);
		expect((await put(stranger, { class_id: "k1", date: "2026-03-02", records: [{ student_id: "s1", present: true }] })).status).toBe(400);
	});

	it("o professor com horário só marca as turmas onde dá aulas", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT OR IGNORE INTO Users (uid, school_id, role, name) VALUES ('t2', 'a1', 'teacher', 'T2')"),
			env.DB.prepare("INSERT OR IGNORE INTO TimetableSlots (id, school_id, class_id, title, weekday, start_time, end_time, teacher_uid) VALUES ('ts1', 'a1', 'k2', 'Aula', 1, '08:00', '08:45', 't2')"),
		]);
		const t2: User = { uid: "t2", schoolId: "a1", role: "teacher" };
		expect((await put(t2, { class_id: "k1", date: "2026-03-04", records: [{ student_id: "s1", present: true }] })).status).toBe(403);
		expect((await put(t2, { class_id: "k2", date: "2026-03-04", records: [{ student_id: "s3", present: true }] })).status).toBe(200);
		await env.DB.prepare("DELETE FROM Attendance WHERE date = '2026-03-04'").run();
	});

	it("resumo da turma conta presenças e faltas", async () => {
		const body = (await (await call(teacher, "/attendance/summary?class_id=k1")).json()) as { data: { student_id: string; present_days: number; absent_days: number }[]; days_marked: number };
		expect(body.days_marked).toBe(2);
		expect(body.data[0]).toMatchObject({ student_id: "s1", present_days: 1, absent_days: 1 });
	});

	it("o resumo da turma ignora registos de quando o aluno estava noutra turma", async () => {
		await env.DB.prepare("INSERT INTO Attendance (id, school_id, student_id, class_id, date, present) VALUES ('old-k2', 'a1', 's2', 'k2', '2026-01-10', 0)").run();
		const body = (await (await call(teacher, "/attendance/summary?class_id=k1")).json()) as { data: { student_id: string; absent_days: number }[] };
		expect(body.data.find((r) => r.student_id === "s2")?.absent_days).toBe(0);
		const roster = (await (await call(teacher, "/attendance?class_id=k1&date=2026-01-10")).json()) as { data: { student_id: string; present: boolean | null }[] };
		expect(roster.data.find((r) => r.student_id === "s2")?.present).toBeNull();
	});

	it("o encarregado vê só o histórico do seu educando", async () => {
		const res = await call(parent, "/attendance/student/s1");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ present_days: 1, absent_days: 1, absences: ["2026-03-03"] });
		expect((await call(otherParent, "/attendance/student/s1")).status).toBe(404);
		expect((await call(parent, "/attendance/student/s2")).status).toBe(404);
	});
});
