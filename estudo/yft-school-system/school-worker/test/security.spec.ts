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
