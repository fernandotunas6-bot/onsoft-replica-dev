import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/features/messages/chat-adapter.ts"), "utf8");
const subscription = source.slice(
  source.indexOf("subscribe(handlers"),
  source.indexOf("\n    },\n  };"),
);

describe("chat realtime channel lifecycle", () => {
  it("creates a unique topic for every subscription", () => {
    expect(subscription).toContain(".channel(`siga-chat:${crypto.randomUUID()}`");
  });

  it("registers listeners before subscribing and removes the captured channel", () => {
    expect(subscription).toMatch(
      /const subscribedChannel[\s\S]*?subscribedChannel\s+\.on\([\s\S]*?\.subscribe\(/,
    );
    expect(subscription).toContain("void supabase.removeChannel(subscribedChannel)");
    expect(subscription).toContain("if (channel === subscribedChannel) channel = null");
    expect(subscription).not.toContain("removeChannel(channel)");
  });
});
