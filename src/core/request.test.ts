import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseRequestFile } from "./request.js";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "request-parse-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("parseRequestFile references", () => {
  it("rejects missing reference files", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "req.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: x",
        "  references:",
        '    - path: "./missing.png"',
        "  size: 1K",
        "",
      ].join("\n"),
    );
    expect(() => parseRequestFile(file)).toThrow(/not found/i);
  });

  it("rejects reference path that is a directory", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "refs"));
    const file = path.join(dir, "req.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: x",
        "  references:",
        '    - path: "./refs"',
        "  size: 1K",
        "",
      ].join("\n"),
    );
    expect(() => parseRequestFile(file)).toThrow(/not a file/i);
  });

  it("rejects unsupported reference extension for image", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "clip.mp4"), "x");
    const file = path.join(dir, "req.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: x",
        "  references:",
        '    - path: "./clip.mp4"',
        "  size: 1K",
        "",
      ].join("\n"),
    );
    expect(() => parseRequestFile(file)).toThrow(/not valid for type image/i);
  });

  it("accepts existing image references", () => {
    const dir = makeTmpDir();
    const ref = path.join(dir, "hero.png");
    fs.writeFileSync(ref, "x");
    const file = path.join(dir, "req.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: x",
        "  references:",
        '    - path: "./hero.png"',
        "  size: 1K",
        'output: "./out.png"',
        "",
      ].join("\n"),
    );
    const parsed = parseRequestFile(file);
    expect(parsed.request.type).toBe("image");
    if (parsed.request.type === "image") {
      expect(parsed.request.params.references?.[0]?.path).toBe(ref);
    }
  });

  it("resolves YAML reference to that spec's output (per-file relative paths)", () => {
    // pages/scene.yaml → ../char/hero.yaml → output ./hero.png beside hero.yaml
    const root = makeTmpDir();
    const pages = path.join(root, "pages");
    const char = path.join(root, "char");
    fs.mkdirSync(pages);
    fs.mkdirSync(char);
    const heroPng = path.join(char, "hero.png");
    fs.writeFileSync(heroPng, "hero-pixels");
    fs.writeFileSync(
      path.join(char, "hero.yaml"),
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: hero sheet",
        "  size: 1K",
        'output: "./hero.png"',
        "",
      ].join("\n"),
    );
    const scene = path.join(pages, "scene.yaml");
    fs.writeFileSync(
      scene,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: scene",
        "  references:",
        '    - path: "../char/hero.yaml"',
        "  size: 1K",
        'output: "./scene.png"',
        "",
      ].join("\n"),
    );

    const parsed = parseRequestFile(scene);
    expect(parsed.request.type).toBe("image");
    if (parsed.request.type === "image") {
      expect(parsed.request.params.references?.[0]?.path).toBe(heroPng);
      expect(parsed.request.params.references?.[0]?.type).toBe("image");
    }
  });

  it("rejects YAML reference whose output media is missing", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "hero.yaml"),
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: hero",
        "  size: 1K",
        'output: "./missing.png"',
        "",
      ].join("\n"),
    );
    const file = path.join(dir, "scene.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: scene",
        "  references:",
        '    - path: "./hero.yaml"',
        "  size: 1K",
        "",
      ].join("\n"),
    );
    expect(() => parseRequestFile(file)).toThrow(/output media not found/i);
  });

  it("rejects YAML reference with no output field", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "hero.yaml"),
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: hero",
        "  size: 1K",
        "",
      ].join("\n"),
    );
    const file = path.join(dir, "scene.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: scene",
        "  references:",
        '    - path: "./hero.yaml"',
        "  size: 1K",
        "",
      ].join("\n"),
    );
    expect(() => parseRequestFile(file)).toThrow(/has no output/i);
  });
});

describe("parseRequestFile output", () => {
  it("rejects empty output path", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "req.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: x",
        "  size: 1K",
        "output: ''",
        "",
      ].join("\n"),
    );
    expect(() => parseRequestFile(file)).toThrow(/non-empty file path/i);
  });

  it("rejects non-string output", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "req.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: x",
        "  size: 1K",
        "output: 123",
        "",
      ].join("\n"),
    );
    expect(() => parseRequestFile(file)).toThrow(/non-empty file path/i);
  });

  it("resolves output relative to the request file directory", () => {
    const root = makeTmpDir();
    const nested = path.join(root, "images");
    fs.mkdirSync(nested);
    const file = path.join(nested, "req.yaml");
    fs.writeFileSync(
      file,
      [
        "type: image",
        "model: gemini-3.1-flash-image",
        "params:",
        "  prompt: x",
        "  size: 1K",
        'output: "../out/result.png"',
        "",
      ].join("\n"),
    );
    const parsed = parseRequestFile(file);
    expect(parsed.request.output).toBe(path.join(root, "out", "result.png"));
  });
});
