import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config";
const config = mergeConfig(base, defineConfig({ test: { maxWorkers: 1, testTimeout: 30000 } }));
config.test!.include = ["docs/auditoria/2026-10-07/probes.test.ts"];
export default config;
