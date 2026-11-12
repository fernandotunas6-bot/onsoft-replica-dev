import { env, applyD1Migrations } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv, User } from "../src/app-env";
import notices from "../src/api/notices";

const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
	c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
	await next();
});
app.route("/notices", notices);

const admin: User = { uid: "na", schoolId: "n1", role: "admin" };
const teacher: User = { uid: "nt", schoolId: "n1", role: "teacher" };
const parentA: User = { uid: "pa", schoolId: "n1", role: "parent" }; // educando na turma A
const parentB: User = { uid: "pb", schoolId: "n1", role: "parent" }; // educando na turma B
const stranger: User = { uid: "nx", schoolId: "n2", role: "admin" };

const call = (u: User, path: string, init: RequestInit = {}) =>
	app.request(path, { ...init, headers: { "Content-Type": "application/json", "X-Test-User": JSON.stringify(u) } }, env);
const create = (u: User, body: unknown) => call(u, "/notices", { method: "POST", body: JSON.stringify(body) });
const titles = async (u: User) =>
	((await (await call(u, "/notices")).json()) as { data: { title: string }[] }).data.map((n) => n.title).sort();

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await env.DB.batch(
		[
			"INSERT INTO Schools (id, name) VALUES ('n1', 'N'), ('n2', 'Outra')",
			"INSERT INTO Users (uid, school_id, role, name) VALUES ('pa', 'n1', 'parent', 'A'), ('pb', 'n1', 'parent', 'B')",
			"INSERT INTO Classes (id, school_id, class_name, level) VALUES ('ca', 'n1', 'A', 1), ('cb', 'n1', 'B', 2)",
			"INSERT INTO Students (id, school_id, class_id, parent_uid, name) VALUES ('sa', 'n1', 'ca', 'pa', 'Ana'), ('sb', 'n1', 'cb', 'pb', 'Rui')",
			// Comunicado antigo (antes da 0016): só encarregados. E um recibo individual.
			"INSERT INTO Notices (id, school_id, title, summary, body) VALUES ('old', 'n1', 'Antigo', 's', 'b')",
			"INSERT INTO Notices (id, school_id, parent_uid, title, summary, body, category) VALUES ('rec', 'n1', 'pa', 'Recibo', 's', 'b', 'payment')",
		].map((sql) => env.DB.prepare(sql)),
	);
});

describe("comunicados", () => {
	it("o admin publica para cada público; o resto não pode", async () => {
		expect((await create(admin, { title: "Todos", body: "x", audience: "all" })).status).toBe(201);
		expect((await create(admin, { title: "Pais", body: "x", audience: "parents" })).status).toBe(201);
		expect((await create(admin, { title: "Profs", body: "x", audience: "teachers" })).status).toBe(201);
		expect((await create(admin, { title: "Turma A", body: "x", audience: "class", class_id: "ca" })).status).toBe(201);
		expect((await create(admin, { title: "X", body: "x", audience: "class" })).status).toBe(400);
		expect((await create(stranger, { title: "X", body: "x", audience: "class", class_id: "ca" })).status).toBe(404);
		expect((await create(teacher, { title: "X", body: "x", audience: "all" })).status).toBe(403);
		expect((await create(parentA, { title: "X", body: "x", audience: "all" })).status).toBe(403);
	});

	it("cada um vê só o que lhe é dirigido", async () => {
		expect(await titles(parentA)).toEqual(["Antigo", "Pais", "Recibo", "Todos", "Turma A"]);
		expect(await titles(parentB)).toEqual(["Antigo", "Pais", "Todos"]);
		expect(await titles(teacher)).toEqual(["Profs", "Todos"]);
		expect(await titles(admin)).toEqual(["Antigo", "Pais", "Profs", "Todos", "Turma A"]);
		expect(await titles(stranger)).toEqual([]);
	});

	it("lidos e por ler contam por pessoa, também para professores", async () => {
		const unread = async (u: User) => ((await (await call(u, "/notices/unread-count")).json()) as { unread_count: number }).unread_count;
		expect(await unread(teacher)).toBe(2);
		const { data } = (await (await call(teacher, "/notices")).json()) as { data: { id: string; title: string }[] };
		const profs = data.find((n) => n.title === "Profs")!;
		expect((await call(teacher, `/notices/${profs.id}/read`, { method: "POST" })).status).toBe(200);
		expect(await unread(teacher)).toBe(1);
		expect((await call(parentB, `/notices/${profs.id}/read`, { method: "POST" })).status).toBe(404);
	});

	it("o admin apaga comunicados gerais, mas não recibos individuais", async () => {
		expect((await call(admin, "/notices/rec", { method: "DELETE" })).status).toBe(404);
		expect((await call(admin, "/notices/old", { method: "DELETE" })).status).toBe(200);
		expect(await titles(parentB)).toEqual(["Pais", "Todos"]);
	});
});
