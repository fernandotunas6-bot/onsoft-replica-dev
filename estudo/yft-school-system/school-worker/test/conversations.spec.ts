import { env, applyD1Migrations } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv, User } from "../src/app-env";
import conversations from "../src/api/conversations";

const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
	c.set("user", JSON.parse(c.req.header("X-Test-User")!) as User);
	await next();
});
app.route("/c", conversations);

const admin: User = { uid: "ca", schoolId: "k1", role: "admin" };
const teacher: User = { uid: "ct", schoolId: "k1", role: "teacher" };
const parent: User = { uid: "cp", schoolId: "k1", role: "parent" };
const parent2: User = { uid: "cp2", schoolId: "k1", role: "parent" };
const outsider: User = { uid: "cx", schoolId: "k2", role: "teacher" };

const call = (u: User, path: string, init: RequestInit = {}) =>
	app.request(path, { ...init, headers: { "Content-Type": "application/json", "X-Test-User": JSON.stringify(u) } }, env);
const open = async (u: User, other: string) => call(u, "/c", { method: "POST", body: JSON.stringify({ user_uid: other }) });
const send = (u: User, id: string, body: string) => call(u, `/c/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
const unread = async (u: User) => ((await (await call(u, "/c/unread-count")).json()) as { unread_count: number }).unread_count;

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await env.DB.batch(
		[
			"INSERT INTO Schools (id, name) VALUES ('k1', 'K'), ('k2', 'Outra')",
			"INSERT INTO Users (uid, school_id, role, name, subjects_text) VALUES ('ca', 'k1', 'admin', 'Direcção', NULL), ('ct', 'k1', 'teacher', 'Carlos Mendes', 'Matemática'), ('cp', 'k1', 'parent', 'Mariana Silva', NULL), ('cp2', 'k1', 'parent', 'Outro Pai', NULL), ('cx', 'k2', 'teacher', 'De Fora', NULL)",
			"INSERT INTO Classes (id, school_id, class_name) VALUES ('kc', 'k1', 'C')",
			"INSERT INTO Students (id, school_id, class_id, parent_uid, name) VALUES ('ks', 'k1', 'kc', 'cp', 'Ana')",
		].map((sql) => env.DB.prepare(sql)),
	);
});

describe("conversas", () => {
	let id = "";

	it("contactos: o encarregado só vê funcionários; o professor vê também encarregados com educandos", async () => {
		const p = ((await (await call(parent, "/c/contacts")).json()) as { data: { uid: string }[] }).data.map((u) => u.uid);
		expect(p).toEqual(["ca", "ct"]);
		const t = ((await (await call(teacher, "/c/contacts")).json()) as { data: { uid: string; wards: string | null }[] }).data;
		expect(t.map((u) => u.uid)).toEqual(["ca", "cp", "cp2"]);
		expect(t.find((u) => u.uid === "cp")?.wards).toBe("Ana");
	});

	it("abre uma conversa e reutiliza-a dos dois lados", async () => {
		const res = await open(parent, "ct");
		expect(res.status).toBe(201);
		id = ((await res.json()) as { id: string }).id;
		expect(((await (await open(parent, "ct")).json()) as { id: string }).id).toBe(id);
		expect(((await (await open(teacher, "cp")).json()) as { id: string }).id).toBe(id);
	});

	it("recusa encarregado com encarregado, outra escola e a si próprio", async () => {
		expect((await open(parent, "cp2")).status).toBe(403);
		expect((await open(parent, "cx")).status).toBe(404);
		expect((await open(outsider, "cp")).status).toBe(404);
		expect((await open(parent, "cp")).status).toBe(400);
	});

	it("mensagens, não lidas e marcação como lida", async () => {
		expect((await send(parent, id, "Bom dia, professor.")).status).toBe(201);
		expect((await send(parent, id, "A Ana faltou ontem por doença.")).status).toBe(201);
		expect(await unread(teacher)).toBe(2);
		expect(await unread(parent)).toBe(0);

		const list = ((await (await call(teacher, "/c")).json()) as { data: { id: string; other_name: string; unread: number; last_preview: string }[] }).data;
		expect(list).toEqual([expect.objectContaining({ id, other_name: "Mariana Silva", unread: 2, last_preview: "A Ana faltou ontem por doença." })]);

		const thread = (await (await call(teacher, `/c/${id}/messages`)).json()) as { data: { body: string; mine: boolean }[]; other: { name: string } };
		expect(thread.data.map((m) => [m.body, m.mine])).toEqual([["Bom dia, professor.", false], ["A Ana faltou ontem por doença.", false]]);
		expect(thread.other.name).toBe("Mariana Silva");
		expect(await unread(teacher)).toBe(0);

		expect((await send(teacher, id, "Obrigado, fica registado.")).status).toBe(201);
		expect(await unread(parent)).toBe(1);
	});

	it("quem não é da conversa não lê nem escreve", async () => {
		expect((await call(admin, `/c/${id}/messages`)).status).toBe(404);
		expect((await send(admin, id, "olá")).status).toBe(404);
		expect((await send(parent, id, "   ")).status).toBe(400);
		expect(((await (await call(admin, "/c")).json()) as { data: unknown[] }).data).toEqual([]);
	});

	it("pedidos simultâneos dão a mesma conversa", async () => {
		const [a, b] = await Promise.all([open(admin, "cp2"), open({ uid: "cp2", schoolId: "k1", role: "parent" }, "ca")]);
		const ia = ((await a.json()) as { id: string }).id;
		const ib = ((await b.json()) as { id: string }).id;
		expect(ia).toBe(ib);
		const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM Conversations WHERE pair_key = 'ca|cp2'").all<{ n: number }>();
		expect(results[0].n).toBe(1);
	});

	it("ler não marca como lida uma mensagem posterior à leitura", async () => {
		await call(teacher, `/c/${id}/messages`);
		// Mensagem com data anterior ao "agora" do servidor mas posterior à última vista.
		await env.DB.prepare("INSERT INTO Messages (id, conversation_id, school_id, sender_uid, body, created_at) VALUES ('late', ?, 'k1', 'cp', 'atrasada', strftime('%Y-%m-%d %H:%M:%f', 'now'))").bind(id).run();
		expect(await unread(teacher)).toBe(1);
	});

	it("conversas abertas sem mensagens não aparecem na lista", async () => {
		await open(admin, "ct");
		expect(((await (await call(admin, "/c")).json()) as { data: unknown[] }).data).toEqual([]);
	});

	it("páginas de mensagens anteriores, sem saltos nem repetições", async () => {
		const res = await open(admin, "cp2");
		const cid = ((await res.json()) as { id: string }).id;
		// Todas no mesmo instante: a ordem de inserção desempata.
		await env.DB.batch(
			Array.from({ length: 205 }, (_, i) =>
				env.DB.prepare("INSERT INTO Messages (id, conversation_id, school_id, sender_uid, body, created_at) VALUES (?, ?, 'k1', 'ca', ?, '2026-05-01 10:00:00.000')")
					.bind(`pg-${String(i).padStart(3, "0")}`, cid, `m${i}`),
			),
		);
		type Page = { data: { id: string; body: string }[]; has_more: boolean };
		const get = async (q = "") => (await (await call(parent2, `/c/${cid}/messages${q}`)).json()) as Page;
		const first = await get();
		expect(first.data).toHaveLength(100);
		expect(first.has_more).toBe(true);
		expect(first.data.at(-1)!.body).toBe("m204");
		const second = await get(`?before=${first.data[0].id}`);
		const third = await get(`?before=${second.data[0].id}`);
		expect(second.has_more).toBe(true);
		expect(third.data).toHaveLength(5);
		expect(third.has_more).toBe(false);
		const all = [...third.data, ...second.data, ...first.data].map((m) => m.body);
		expect(all).toEqual(Array.from({ length: 205 }, (_, i) => `m${i}`));
		expect((await call(parent2, `/c/${cid}/messages?before=nope`)).status).toBe(404);
	});
});
