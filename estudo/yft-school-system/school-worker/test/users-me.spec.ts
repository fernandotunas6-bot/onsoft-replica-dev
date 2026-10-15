import { env, applyD1Migrations } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv, User } from "../src/app-env";
import users from "../src/api/users";

const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
	c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
	await next();
});
app.route("/users", users);

const me: User = { uid: "u1", schoolId: "m1", role: "parent" };
const patch = (u: User, body: unknown) =>
	app.request("/users/me", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "X-Test-User": JSON.stringify(u) } }, env);

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await env.DB.batch(
		[
			"INSERT INTO Schools (id, name) VALUES ('m1', 'M')",
			"INSERT INTO Users (uid, school_id, role, name, phone, email) VALUES ('u1', 'm1', 'parent', 'Ana', '923000001', 'ana@x.ao'), ('u2', 'm1', 'teacher', 'Rui', '923000002', 'rui@x.ao')",
		].map((sql) => env.DB.prepare(sql)),
	);
});

describe("PATCH /users/me", () => {
	it("actualiza nome, telefone (normalizado) e morada, mas não o e-mail", async () => {
		const res = await patch(me, { name: "Ana Souza", phone: "+244 923 000 009", residential_address: "Luanda", email: "outro@x.ao" });
		expect(res.status).toBe(200);
		expect(((await res.json()) as { data: unknown }).data).toEqual({
			uid: "u1", name: "Ana Souza", phone: "+244923000009", email: "ana@x.ao", residential_address: "Luanda",
		});
	});

	it("recusa telefone de outra conta da escola e pedidos vazios", async () => {
		expect((await patch(me, { phone: "923000002" })).status).toBe(409);
		expect((await patch(me, {})).status).toBe(400);
		expect((await patch(me, { name: "A" })).status).toBe(400);
	});

	it("só mexe no próprio utilizador", async () => {
		expect((await patch({ uid: "nao-existe", schoolId: "m1", role: "parent" }, { name: "Xavier" })).status).toBe(404);
		const row = await env.DB.prepare("SELECT name FROM Users WHERE uid = 'u2'").first<{ name: string }>();
		expect(row?.name).toBe("Rui");
	});
});
