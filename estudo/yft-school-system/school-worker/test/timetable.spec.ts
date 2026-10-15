import { env, applyD1Migrations } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv, User } from "../src/app-env";
import classes from "../src/api/classes";
import subjects from "../src/api/subjects";
import timetable from "../src/api/timetable";
import users from "../src/api/users";

// As rotas reais, com o utilizador posto por um cabeçalho em vez do token
// Firebase: o que se testa aqui são as regras de acesso e os dados.
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
	c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
	await next();
});
app.route("/classes", classes);
app.route("/subjects", subjects);
app.route("/timetable", timetable);

const admin: User = { uid: "adm", schoolId: "sch1", role: "admin" };
const teacher: User = { uid: "tch", schoolId: "sch1", role: "teacher" };
const parent: User = { uid: "par", schoolId: "sch1", role: "parent" };
const stranger: User = { uid: "adm2", schoolId: "sch2", role: "admin" };

function call(user: User, path: string, init: RequestInit = {}) {
	return app.request(
		path,
		{ ...init, headers: { "Content-Type": "application/json", "X-Test-User": JSON.stringify(user) } },
		env,
	);
}

const post = (user: User, body: unknown) => call(user, "/timetable", { method: "POST", body: JSON.stringify(body) });

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await env.DB.batch(
		[
			"INSERT INTO Schools (id, name) VALUES ('sch1', 'Escola Um'), ('sch2', 'Escola Dois')",
			"INSERT INTO Users (uid, school_id, role, name) VALUES ('par', 'sch1', 'parent', 'Encarregado'), ('tch', 'sch1', 'teacher', 'Carlos Mendes'), ('tch2', 'sch2', 'teacher', 'De Fora')",
			"INSERT INTO Classes (id, school_id, class_name, level) VALUES ('c10', 'sch1', '10ª', 10), ('c11', 'sch1', '11ª', 11), ('x1', 'sch2', 'Outra', 1)",
			"INSERT INTO Subjects (id, school_id, name) VALUES ('mat', 'sch1', 'Matemática'), ('his', 'sch1', 'História')",
			"INSERT INTO SubjectClasses (id, school_id, subject_id, class_id) VALUES ('sc1', 'sch1', 'mat', 'c10'), ('sc2', 'sch1', 'his', 'c11')",
			"INSERT INTO Students (id, school_id, class_id, parent_uid, name) VALUES ('st1', 'sch1', 'c10', 'par', 'Ana')",
		].map((sql) => env.DB.prepare(sql)),
	);
});

describe("horário", () => {
	it("o admin cria tempos e recusa sobreposições", async () => {
		expect((await post(admin, { class_id: "c10", subject_id: "mat", weekday: 1, start_time: "09:00", end_time: "10:30", room: "Sala 3", teacher_uid: "tch" })).status).toBe(201);
		expect((await post(admin, { class_id: "c10", title: "Almoço", weekday: 1, start_time: "12:15", end_time: "13:30" })).status).toBe(201);
		expect((await post(admin, { class_id: "c11", subject_id: "his", weekday: 1, start_time: "09:00", end_time: "10:00" })).status).toBe(201);
		expect((await post(admin, { class_id: "c10", subject_id: "mat", weekday: 1, start_time: "10:00", end_time: "11:00" })).status).toBe(409);
	});

	it("valida horas, disciplina ou título, e a escola", async () => {
		expect((await post(admin, { class_id: "c10", subject_id: "mat", weekday: 2, start_time: "11:00", end_time: "10:00" })).status).toBe(400);
		expect((await post(admin, { class_id: "c10", weekday: 2, start_time: "08:00", end_time: "09:00" })).status).toBe(400);
		expect((await post(admin, { class_id: "c10", subject_id: "mat", weekday: 8, start_time: "08:00", end_time: "09:00" })).status).toBe(400);
		expect((await post(stranger, { class_id: "c10", subject_id: "mat", weekday: 2, start_time: "08:00", end_time: "09:00" })).status).toBe(404);
	});

	it("só o admin escreve", async () => {
		expect((await post(teacher, { class_id: "c10", title: "X", weekday: 3, start_time: "08:00", end_time: "09:00" })).status).toBe(403);
		expect((await post(parent, { class_id: "c10", title: "X", weekday: 3, start_time: "08:00", end_time: "09:00" })).status).toBe(403);
	});

	it("o professor vê a escola toda, ordenada", async () => {
		const { data } = (await (await call(teacher, "/timetable")).json()) as { data: { subject_name: string | null; title: string | null; class_name: string }[] };
		expect(data.map((s) => s.subject_name ?? s.title)).toEqual(["Matemática", "História", "Almoço"]);
	});

	it("o encarregado vê só a turma do educando", async () => {
		const { data } = (await (await call(parent, "/timetable")).json()) as { data: { class_id: string }[] };
		expect(data.length).toBe(2);
		expect(data.every((s) => s.class_id === "c10")).toBe(true);
		expect((await call(parent, "/timetable?class_id=c11")).status).toBe(403);
	});

	it("outra escola não vê nada", async () => {
		const { data } = (await (await call(stranger, "/timetable")).json()) as { data: unknown[] };
		expect(data).toEqual([]);
	});

	it("apagar só dentro da escola", async () => {
		const { data } = (await (await call(admin, "/timetable?class_id=c11")).json()) as { data: { id: string }[] };
		expect((await call(stranger, `/timetable/${data[0].id}`, { method: "DELETE" })).status).toBe(404);
		expect((await call(admin, `/timetable/${data[0].id}`, { method: "DELETE" })).status).toBe(200);
	});
});

describe("professor do tempo", () => {
	it("recusa professor de outra escola", async () => {
		expect((await post(admin, { class_id: "c10", subject_id: "mat", weekday: 4, start_time: "08:00", end_time: "09:00", teacher_uid: "tch2" })).status).toBe(404);
	});

	it("?mine=1 devolve só as aulas do professor, com o nome dele", async () => {
		const { data } = (await (await call(teacher, "/timetable?mine=1")).json()) as { data: { subject_name: string; teacher_name: string }[] };
		expect(data.map((s) => s.subject_name)).toEqual(["Matemática"]);
		expect(data[0].teacher_name).toBe("Carlos Mendes");
	});

	it("lista de professores só para o admin e só da escola", async () => {
		const usersApp = new Hono<AppEnv>();
		usersApp.use("*", async (c, next) => {
			c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
			await next();
		});
		usersApp.route("/users", users);
		const get = (u: User) => usersApp.request("/users/teachers", { headers: { "X-Test-User": JSON.stringify(u) } }, env);
		const { data } = (await (await get(admin)).json()) as { data: { uid: string }[] };
		expect(data.map((t) => t.uid)).toEqual(["tch"]);
		expect((await get(teacher)).status).toBe(403);
		expect((await get(parent)).status).toBe(403);
	});
});

describe("disciplinas e turmas para o encarregado", () => {
	it("vê só as disciplinas da turma do educando", async () => {
		const { data } = (await (await call(parent, "/subjects")).json()) as { data: { name: string }[] };
		expect(data.map((s) => s.name)).toEqual(["Matemática"]);
		expect((await call(parent, "/subjects?class_id=c11")).status).toBe(403);
	});

	it("vê só a turma do educando, sem propinas", async () => {
		const { data } = (await (await call(parent, "/classes")).json()) as { data: Record<string, unknown>[] };
		expect(data.map((c) => c.id)).toEqual(["c10"]);
		expect(data[0]).not.toHaveProperty("fee_amount");
	});

	it("admin continua a ver tudo", async () => {
		const { data } = (await (await call(admin, "/subjects")).json()) as { data: unknown[] };
		expect(data.length).toBe(2);
	});
});
