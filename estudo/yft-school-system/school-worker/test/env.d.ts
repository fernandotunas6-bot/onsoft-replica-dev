declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {
		TEST_MIGRATIONS: D1Migration[];
		CONTRACT_DUMP?: string;
	}
}
