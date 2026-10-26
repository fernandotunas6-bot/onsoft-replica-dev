import { describe, expect, it } from "vitest";
import { roomLabel } from "@/lib/room-label";

describe("roomLabel", () => {
  it("número ganha «Sala»; nomes ficam como estão", () => {
    expect(roomLabel("12")).toBe("Sala 12");
    expect(roomLabel(" 3B ")).toBe("Sala 3B");
    expect(roomLabel("Sala 4")).toBe("Sala 4");
    expect(roomLabel("Laboratório")).toBe("Laboratório");
  });
});
