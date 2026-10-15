import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const KEY = "k".repeat(40);

async function call(path: string, init: RequestInit, bindings: Record<string, unknown> = {}) {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`https://example.com${path}`, init), { ...env, ...bindings }, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe("chave do super-admin", () => {
	it("recusa sem chave, com chave errada e com chave de outro tamanho", async () => {
		for (const headers of [{}, { "X-Super-Admin-Key": "k".repeat(39) + "x" }, { "X-Super-Admin-Key": "k" }]) {
			const response = await call("/api/super-admin/schools", { headers }, { SUPER_ADMIN_API_KEY: KEY });
			expect(response.status).toBe(403);
		}
	});

	it("deixa passar a chave certa (o pedido segue para a rota)", async () => {
		const response = await call(
			"/api/super-admin/schools",
			{ headers: { "X-Super-Admin-Key": KEY } },
			{ SUPER_ADMIN_API_KEY: KEY },
		);
		expect(response.status).not.toBe(403);
	});
});

describe("CORS", () => {
	const preflight = (origin: string, bindings = {}) =>
		call("/health", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } }, bindings);

	it("já não aceita qualquer *.workers.dev ou *.vercel.app", async () => {
		for (const origin of ["https://atacante.workers.dev", "https://atacante.vercel.app"]) {
			const response = await preflight(origin);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		}
	});

	it("aceita localhost e as origens de ALLOWED_ORIGINS", async () => {
		expect((await preflight("http://localhost:5173")).headers.get("Access-Control-Allow-Origin")).toBe(
			"http://localhost:5173",
		);
		const response = await preflight("https://admin.portal-siga.com", {
			ALLOWED_ORIGINS: "https://admin.portal-siga.com, https://outra.exemplo",
		});
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://admin.portal-siga.com");
	});
});

describe("senha da escola no onboarding", () => {
	const onboard = (school: Record<string, unknown>) =>
		call(
			"/api/super-admin/onboard-school",
			{
				method: "POST",
				headers: { "X-Super-Admin-Key": KEY, "Content-Type": "application/json" },
				body: JSON.stringify({ school: { name: "Escola", ...school }, admin: { name: "Admin", phone: "+244923000000", email: "admin@escola.ao" } }),
			},
			{ SUPER_ADMIN_API_KEY: KEY },
		);

	it("recusa escola sem senha (antes ficava «Welcome@123») e senha curta", async () => {
		for (const school of [{}, { default_password: "Welcome@1" }]) {
			expect((await onboard(school)).status).toBe(400);
		}
		// O mesmo pedido com uma senha válida passa a validação (falha depois,
		// na base de dados vazia do teste, mas não com 400).
		expect((await onboard({ default_password: "senha-da-escola-2026" })).status).not.toBe(400);
	});
});
