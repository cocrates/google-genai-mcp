import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSpecAnalyzePrompt,
  DEFAULT_SPEC_ANALYZE_PROMPT,
  isAnalyzeRequestSpecPath,
  loadSpecAnalyzeContext,
  partitionAnalyzeInputs,
  resolveInputsFromSpec,
} from "./analyze-spec.js";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "analyze-spec-"));
  tmpDirs.push(dir);
  return dir;
}

function writeImageRequest(
  dir: string,
  name: string,
  extra: string[] = [],
  output = "./out.png",
): string {
  const requestPath = path.join(dir, name);
  fs.writeFileSync(
    requestPath,
    [
      "type: image",
      "model: gemini-3.1-flash-image",
      "params:",
      "  prompt: x",
      "  size: 1K",
      ...extra,
      `output: "${output}"`,
      "",
    ].join("\n"),
  );
  return requestPath;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadSpecAnalyzeContext", () => {
  it("includes referenced YAML specs recursively with per-file relative paths", () => {
    // layout:
    //   pages/a.yaml  → references: ../char/b.yaml
    //   char/b.yaml   → references: ./c.yaml   (same folder as b)
    //   char/c.yaml
    const root = makeTmpDir();
    const pages = path.join(root, "pages");
    const char = path.join(root, "char");
    fs.mkdirSync(pages);
    fs.mkdirSync(char);

    fs.writeFileSync(path.join(char, "c.png"), "c-media");
    fs.writeFileSync(
      path.join(char, "c.yaml"),
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: character c",
        "  size: 1K",
        'output: "./c.png"',
        "",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(char, "b.png"), "b-media");
    fs.writeFileSync(
      path.join(char, "b.yaml"),
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: character b",
        "  references:",
        '    - path: "./c.yaml"',
        "  size: 1K",
        'output: "./b.png"',
        "",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(pages, "a.png"), "a-media");
    const aPath = path.join(pages, "a.yaml");
    fs.writeFileSync(
      aPath,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: scene a",
        "  references:",
        '    - path: "../char/b.yaml"',
        "  size: 1K",
        'output: "./a.png"',
        "",
      ].join("\n"),
    );

    const ctx = loadSpecAnalyzeContext(aPath);
    expect(ctx.docs.map((d) => d.path)).toEqual([
      aPath,
      path.join(char, "b.yaml"),
      path.join(char, "c.yaml"),
    ]);
    expect(ctx.docs.map((d) => d.role)).toEqual([
      "request",
      "reference",
      "reference",
    ]);
    // Prompt must not embed media file bodies — only YAML docs.
    const prompt = buildSpecAnalyzePrompt(undefined, ctx);
    expect(prompt).toContain("character b");
    expect(prompt).toContain("character c");
    expect(prompt).not.toContain("b-media");
  });

  it("includes a shared referenced YAML only once (diamond)", () => {
    // a → b, a → c, b → d, c → d  ⇒ docs = [a, b, c, d] (d once)
    const root = makeTmpDir();
    for (const name of ["a", "b", "c", "d"]) {
      fs.writeFileSync(path.join(root, `${name}.png`), `${name}-media`);
    }
    fs.writeFileSync(
      path.join(root, "d.yaml"),
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: shared d",
        "  size: 1K",
        'output: "./d.png"',
        "",
      ].join("\n"),
    );
    for (const name of ["b", "c"] as const) {
      fs.writeFileSync(
        path.join(root, `${name}.yaml`),
        [
          "type: image",
          "model: gemini-3.1-flash-image",
          "params:",
          `  prompt: node ${name}`,
          "  references:",
          '    - path: "./d.yaml"',
          "  size: 1K",
          `output: "./${name}.png"`,
          "",
        ].join("\n"),
      );
    }
    const aPath = path.join(root, "a.yaml");
    fs.writeFileSync(
      aPath,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: root a",
        "  references:",
        '    - path: "./b.yaml"',
        '    - path: "./c.yaml"',
        '    - path: "./d.yaml"',
        "  size: 1K",
        'output: "./a.png"',
        "",
      ].join("\n"),
    );

    const ctx = loadSpecAnalyzeContext(aPath);
    const paths = ctx.docs.map((d) => d.path);
    expect(paths).toEqual([
      path.resolve(aPath),
      path.resolve(root, "b.yaml"),
      path.resolve(root, "d.yaml"),
      path.resolve(root, "c.yaml"),
    ]);
    expect(paths.filter((p) => p.endsWith(`${path.sep}d.yaml`))).toHaveLength(1);
  });

  it("does not follow direct media references for prompt inclusion", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "hero.png"), "pixels");
    fs.writeFileSync(path.join(dir, "out.png"), "out");
    // Even if a companion hero.yaml exists, media refs must not pull it in.
    fs.writeFileSync(
      path.join(dir, "hero.yaml"),
      "title: should-not-appear\n",
    );
    const requestPath = writeImageRequest(dir, "page.yaml", [
      "  references:",
      '    - path: "./hero.png"',
    ]);

    const ctx = loadSpecAnalyzeContext(requestPath);
    expect(ctx.docs).toHaveLength(1);
    expect(ctx.docs[0]!.role).toBe("request");
    expect(ctx.docs.some((d) => d.content.includes("should-not-appear"))).toBe(
      false,
    );
  });

  it("rejects missing output media", () => {
    const dir = makeTmpDir();
    const requestPath = writeImageRequest(dir, "a.yaml");
    expect(() => loadSpecAnalyzeContext(requestPath)).toThrow(/not found/i);
  });

  it("rejects output that is a directory", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "out.png"));
    const requestPath = writeImageRequest(dir, "a.yaml");
    expect(() => loadSpecAnalyzeContext(requestPath)).toThrow(/not a file/i);
  });

  it("rejects missing reference YAML", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "out.png"), "x");
    const requestPath = writeImageRequest(dir, "a.yaml", [
      "  references:",
      '    - path: "./missing.yaml"',
    ]);
    expect(() => loadSpecAnalyzeContext(requestPath)).toThrow(/not found/i);
  });
});

describe("buildSpecAnalyzePrompt", () => {
  it("orders user prompt, checklist, then YAML docs", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "out.png"), "x");
    const requestPath = path.join(dir, "a.yaml");
    fs.writeFileSync(
      requestPath,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: red circle",
        "  size: 1K",
        'output: "./out.png"',
        "",
      ].join("\n"),
    );
    const ctx = loadSpecAnalyzeContext(requestPath);
    const prompt = buildSpecAnalyzePrompt("포커스를 인물에 맞춰 주세요", ctx);

    expect(prompt.indexOf("## 사용자 분석 요청")).toBeLessThan(
      prompt.indexOf("## 일반 분석 요청"),
    );
    expect(prompt.indexOf("## 일반 분석 요청")).toBeLessThan(
      prompt.indexOf("## 미디어 생성 스펙"),
    );
    expect(prompt).toContain("포커스를 인물에 맞춰 주세요");
    expect(prompt).toContain(DEFAULT_SPEC_ANALYZE_PROMPT.slice(0, 40));
    expect(prompt).toContain("red circle");
  });

  it("omits user section when prompt is empty", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "out.png"), "x");
    const requestPath = writeImageRequest(dir, "a.yaml");
    const ctx = loadSpecAnalyzeContext(requestPath);
    const prompt = buildSpecAnalyzePrompt("", ctx);
    expect(prompt).not.toContain("## 사용자 분석 요청");
    expect(prompt).toContain("## 일반 분석 요청");
  });
});

describe("resolveInputsFromSpec", () => {
  it("defaults to YAML output when inputs are empty", () => {
    const dir = makeTmpDir();
    const out = path.join(dir, "out.png");
    fs.writeFileSync(out, "x");
    const requestPath = writeImageRequest(dir, "a.yaml");
    const ctx = loadSpecAnalyzeContext(requestPath);
    expect(resolveInputsFromSpec([], ctx)).toEqual([out]);
  });

  it("keeps explicit inputs", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "out.png"), "x");
    const requestPath = writeImageRequest(dir, "a.yaml");
    const ctx = loadSpecAnalyzeContext(requestPath);
    expect(resolveInputsFromSpec(["./other.png"], ctx)).toEqual([
      "./other.png",
    ]);
  });
});

describe("partitionAnalyzeInputs", () => {
  it("detects yaml/json as request and leaves media", () => {
    expect(isAnalyzeRequestSpecPath("./page.yaml")).toBe(true);
    expect(isAnalyzeRequestSpecPath("./page.yml")).toBe(true);
    expect(isAnalyzeRequestSpecPath("./page.json")).toBe(true);
    expect(isAnalyzeRequestSpecPath("./out.png")).toBe(false);
    expect(isAnalyzeRequestSpecPath("https://example.com/a.yaml")).toBe(false);

    expect(
      partitionAnalyzeInputs(["./page.yaml", "./extra.png", "https://x.com/a.mp4"]),
    ).toEqual({
      requestFile: "./page.yaml",
      mediaInputs: ["./extra.png", "https://x.com/a.mp4"],
    });
  });

  it("rejects multiple request specs", () => {
    expect(() =>
      partitionAnalyzeInputs(["a.yaml", "b.json"]),
    ).toThrow(/at most one/i);
  });
});
