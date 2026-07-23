/**
 * Smoke-test MCP stdio server against core tools (shared path with CLI).
 * Usage: node --input-type=module scripts/verify-mcp.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = path.join(root, "examples", ".mcp-verify");
fs.mkdirSync(tmpDir, { recursive: true });

const speechYaml = path.join(tmpDir, "mcp-speech.yaml");
fs.writeFileSync(
  speechYaml,
  `type: speech
model: gemini-3.1-flash-tts-preview
params:
  text: |
    Say cheerfully: MCP smoke test OK.
  voice: Kore
  outputFormat: wav
output: "./mcp-speech.wav"
`,
  "utf-8",
);

const expectedTools = [
  "generate",
  "download",
  "get_interaction",
  "continue_interaction",
  "list_interactions",
  "sync_interactions",
  "cancel_interaction",
  "delete_interaction",
];

function parseToolText(result) {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return { raw: result };
  try {
    return JSON.parse(text);
  } catch {
    return { message: text, isError: result.isError };
  }
}

const transport = new StdioClientTransport({
  command: "node",
  args: [path.join(root, "dist/mcp/index.js")],
  cwd: root,
  env: { ...process.env },
  stderr: "pipe",
});

const client = new Client({ name: "mcp-verify", version: "0.1.0" });

const report = [];
function ok(msg) {
  report.push(`PASS  ${msg}`);
  console.log(`PASS  ${msg}`);
}
function fail(msg) {
  report.push(`FAIL  ${msg}`);
  console.error(`FAIL  ${msg}`);
}

try {
  await client.connect(transport);
  ok("stdio connect");

  const listed = await client.listTools();
  const names = listed.tools.map((t) => t.name).sort();
  const missing = expectedTools.filter((n) => !names.includes(n));
  if (missing.length) fail(`tools missing: ${missing.join(", ")}`);
  else ok(`tools/list (${names.length}): ${names.join(", ")}`);

  const genDesc = listed.tools.find((t) => t.name === "generate")?.description ?? "";
  if (/speech/i.test(genDesc) && /music/i.test(genDesc)) {
    ok("generate description mentions speech + music");
  } else {
    fail(`generate description stale: ${genDesc}`);
  }

  // Parse-path check: rejected audio type surfaces through MCP generate
  const badYaml = path.join(tmpDir, "bad-audio.yaml");
  fs.writeFileSync(
    badYaml,
    `type: audio\nparams:\n  text: hi\noutput: ./x.wav\n`,
    "utf-8",
  );
  const bad = await client.callTool({
    name: "generate",
    arguments: { filePath: badYaml },
  });
  const badBody = parseToolText(bad);
  if (bad.isError && /speech|music/i.test(String(badBody.message ?? badBody))) {
    ok('type "audio" rejected via MCP generate');
  } else {
    fail(`expected audio rejection, got: ${JSON.stringify(badBody)}`);
  }

  // Live generate (speech) — same core as CLI, mode=mcp
  const gen = await client.callTool({
    name: "generate",
    arguments: { filePath: speechYaml },
  });
  const genBody = parseToolText(gen);
  if (gen.isError) {
    fail(`generate speech: ${genBody.message ?? JSON.stringify(genBody)}`);
  } else if (genBody.interactionId && Array.isArray(genBody.files)) {
    ok(
      `generate speech → interactionId=${String(genBody.interactionId).slice(0, 24)}… files=${genBody.files.length} background=${genBody.background}`,
    );

    const out = genBody.files[0]?.filePath;
    if (out && fs.existsSync(out) && fs.statSync(out).size > 100) {
      ok(`output file exists (${fs.statSync(out).size} bytes): ${out}`);
    } else {
      fail(`missing/empty output: ${out}`);
    }

    const got = await client.callTool({
      name: "get_interaction",
      arguments: { interactionId: genBody.interactionId },
    });
    const gotBody = parseToolText(got);
    if (!got.isError && gotBody.exists && gotBody.status === "completed") {
      ok(
        `get_interaction status=${gotBody.status} index=${gotBody.index} type fields ok`,
      );
    } else {
      fail(`get_interaction: ${JSON.stringify(gotBody).slice(0, 300)}`);
    }

    const list = await client.callTool({ name: "list_interactions", arguments: {} });
    const listBody = parseToolText(list);
    const found = listBody.interactions?.some(
      (i) => i.interactionId === genBody.interactionId,
    );
    if (found) ok("list_interactions includes new id");
    else fail("list_interactions missing new id");

    // continue (short) — TTS models reject multi-turn (API limitation, same for CLI)
    const cont = await client.callTool({
      name: "continue_interaction",
      arguments: {
        interactionId: genBody.interactionId,
        text: "Repeat the same line a bit slower.",
      },
    });
    const contBody = parseToolText(cont);
    if (
      cont.isError &&
      /Audio input modality is not enabled|not enabled for this model/i.test(
        String(contBody.message ?? ""),
      )
    ) {
      ok(
        "continue_interaction on speech → API rejects (expected TTS limitation, not MCP bug)",
      );
    } else if (cont.isError) {
      fail(`continue_interaction: ${contBody.message ?? JSON.stringify(contBody)}`);
    } else {
      ok(`continue_interaction → ${String(contBody.interactionId).slice(0, 24)}…`);
    }

    const dlPath = path.join(tmpDir, "mcp-speech-redownload.wav");
    const dl = await client.callTool({
      name: "download",
      arguments: {
        interactionId: genBody.interactionId,
        filePath: dlPath,
      },
    });
    const dlBody = parseToolText(dl);
    if (
      !dl.isError &&
      fs.existsSync(dlPath) &&
      fs.statSync(dlPath).size > 100
    ) {
      ok(`download via MCP (${fs.statSync(dlPath).size} bytes)`);
    } else {
      fail(`download: ${JSON.stringify(dlBody).slice(0, 300)}`);
    }
  } else {
    fail(`unexpected generate payload: ${JSON.stringify(genBody).slice(0, 400)}`);
  }

  // Example YAML parseability through MCP generate with dry-ish: only check request parse
  // by attempting generate with nonexistent would fail differently — instead use request module
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  try {
    await client.close();
  } catch {
    // ignore
  }
}

const failed = report.some((l) => l.startsWith("FAIL"));
console.log(failed ? "\nMCP verify: FAILED" : "\nMCP verify: OK");
process.exit(failed ? 1 : 0);
