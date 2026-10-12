import { expect, it } from "vitest";
import { getCookie, requestContext } from "../staging/request-context";
it("keeps cookies isolated between simultaneous asynchronous requests", async () => {
  const read = (school: string) =>
    requestContext.run(
      new Request("https://mobile.example/api/mobile-v4/session", {
        headers: { cookie: `active-school=${school}; other=ignored` },
      }),
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return getCookie("active-school");
      },
    );
  expect(await Promise.all([read("school-a"), read("school-b")])).toEqual(["school-a", "school-b"]);
  expect(() => getCookie("active-school")).toThrow("No active HTTP request");
});
it("matches exact cookie names and rejects malformed encodings", () => {
  requestContext.run(
    new Request("https://mobile.example", {
      headers: { cookie: "other-active-school=wrong; active-school=%ZZ" },
    }),
    () => {
      expect(getCookie("active-school")).toBeUndefined();
      expect(getCookie("missing")).toBeUndefined();
    },
  );
});
