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

describe("tipo de imagem pelo conteúdo", () => {
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
	const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
	const webp = new Uint8Array([
		0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
	]);
	const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
	const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");

	it("reconhece PNG, JPEG e WebP, e recusa SVG onde ele não entra", async () => {
		const { detectImageKind } = await import("../src/lib/media-type");
		expect(detectImageKind(png)?.contentType).toBe("image/png");
		expect(detectImageKind(jpeg)?.contentType).toBe("image/jpeg");
		expect(detectImageKind(webp)?.contentType).toBe("image/webp");
		expect(detectImageKind(svg)).toBeNull();
		expect(detectImageKind(svg, true)?.contentType).toBe("image/svg+xml");
	});

	it("não aceita um ficheiro que só se diz imagem", async () => {
		const { detectImageKind } = await import("../src/lib/media-type");
		expect(detectImageKind(html)).toBeNull();
		expect(detectImageKind(html, true)).toBeNull();
		expect(detectImageKind(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
	});

	it("o logótipo recusa conteúdo que não é imagem, mesmo anunciado como PNG", async () => {
		const form = new FormData();
		form.set("logo", new File([html], "logo.png", { type: "image/png" }));
		const response = await call(
			"/api/super-admin/upload-logo",
			{ method: "POST", headers: { "X-Super-Admin-Key": KEY }, body: form },
			{ SUPER_ADMIN_API_KEY: KEY },
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string };
		// A mensagem não repete o tipo que o cliente declarou.
		expect(body.error).not.toContain("image/png");
	});
});

describe("identidade vem da base, não do token", () => {
	it("a tabela Users decide: sem linha não há sessão pelas claims", async () => {
		const { resolveTenantUser } = await import("../src/lib/school-context");
		const ctx = {
			env: {
				DB: {
					prepare: () => ({
						bind: () => ({ first: async () => null }),
					}),
				},
			},
			get: () => undefined,
		} as unknown as Parameters<typeof resolveTenantUser>[0];
		const resolved = await resolveTenantUser(ctx, {
			sub: "uid-removido",
			school_id: "sch_outra",
			role: "admin",
		});
		expect(resolved).toBeNull();
	});
});
