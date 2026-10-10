#!/usr/bin/env bun
/**
 * Regenera supabase/seeds/education/catalog.sql a partir de
 * src/features/education-catalog/data/. Uso: npm run siga:catalog-seed
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCatalogSeedSql } from "../../src/features/education-catalog/seed-sql";

const out = resolve(import.meta.dir, "../../supabase/seeds/education/catalog.sql");
writeFileSync(out, buildCatalogSeedSql());
console.log(`write ${out}`);
