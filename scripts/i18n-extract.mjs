// Lists every Arabic UI string in src/ (the translation keys) and reports keys missing from the English catalog.
//   node scripts/i18n-extract.mjs            -> summary
//   node scripts/i18n-extract.mjs --missing  -> JSON array of untranslated keys
//   node scripts/i18n-extract.mjs --prune    -> drop catalog entries whose key no longer exists
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG = path.join(ROOT, "src/i18n/messages/en.json");
const AR = /[\u0600-\u06FF]/;
// Keys must contain an Arabic letter or the Arabic comma: digit tables in parsers are not interface text.
const AR_LETTER = /[\u0621-\u064A\u060C]/;
const IGNORE = new Set(["reverse:EARN مرتجع {0}"]);
// Generated code and tests are not interface text.
const SKIP = [/\/generated\//, /\.test\.tsx?$/];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !SKIP.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

function jsxTextNorm(s) {
  const lines = s.split(/\r?\n/);
  if (lines.length === 1) return s.trim();
  return lines.map((l) => l.trim()).filter(Boolean).join(" ").trim();
}

export function extractKeys() {
  const keys = new Map(); // key -> first location
  for (const file of walk(path.join(ROOT, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    if (!AR.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (k, node) => {
      if (!k || !AR_LETTER.test(k) || IGNORE.has(k)) return;
      if (!keys.has(k)) keys.set(k, `${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
    };
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text, node);
      else if (ts.isTemplateExpression(node)) {
        let k = node.head.text;
        node.templateSpans.forEach((s, i) => (k += `{${i}}` + s.literal.text));
        add(k, node);
      } else if (ts.isJsxText(node)) add(jsxTextNorm(node.text), node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return keys;
}

if (process.argv[1] === import.meta.filename) {
  const keys = extractKeys();
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const missing = [...keys.keys()].filter((k) => !(k in catalog));
  if (process.argv.includes("--missing")) {
    console.log(JSON.stringify(missing, null, 1));
  } else if (process.argv.includes("--prune")) {
    const pruned = Object.fromEntries(Object.entries(catalog).filter(([k]) => keys.has(k)));
    fs.writeFileSync(CATALOG, JSON.stringify(pruned, null, 2) + "\n");
    console.log(`pruned ${Object.keys(catalog).length - Object.keys(pruned).length}`);
  } else {
    const stale = Object.keys(catalog).filter((k) => !keys.has(k));
    console.log(`keys: ${keys.size}, translated: ${keys.size - missing.length}, missing: ${missing.length}, stale: ${stale.length}`);
  }
}
