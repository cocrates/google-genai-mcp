import { describe, expect, it } from "vitest";
import {
  INLINE_MAX_BYTES,
  MAX_ANALYZE_INPUTS,
  resolveAnalyzeInput,
} from "./analyze.js";

describe("analyze constants", () => {
  it("matches spec limits", () => {
    expect(MAX_ANALYZE_INPUTS).toBe(10);
    expect(INLINE_MAX_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe("resolveAnalyzeInput", () => {
  it("maps YouTube URLs to video uri parts", async () => {
    const part = await resolveAnalyzeInput(
      "https://www.youtube.com/watch?v=9hE5-98ZeCg",
      "/tmp",
    );
    expect(part).toEqual({
      kind: "uri",
      type: "video",
      uri: "https://www.youtube.com/watch?v=9hE5-98ZeCg",
    });
  });

  it("maps http image URLs with mime from extension", async () => {
    const part = await resolveAnalyzeInput(
      "https://example.com/path/photo.png",
      "/tmp",
    );
    expect(part.kind).toBe("uri");
    if (part.kind === "uri") {
      expect(part.type).toBe("image");
      expect(part.mime_type).toBe("image/png");
      expect(part.uri).toContain("photo.png");
    }
  });

  it("rejects missing local files", async () => {
    await expect(
      resolveAnalyzeInput("./does-not-exist-xyz.mp4", "/tmp"),
    ).rejects.toThrow(/not found/i);
  });
});
