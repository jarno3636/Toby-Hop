import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components", "hooks", "lib"];
const extensions = [".ts", ".tsx"];
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.includes(path.extname(entry.name))) files.push(full);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);

const modules = new Map();
for (const file of files) {
  const withoutExtension = file.replace(/\.(tsx?|jsx?)$/, "");
  modules.set(withoutExtension, file);
  if (withoutExtension.endsWith("/index")) modules.set(withoutExtension.slice(0, -6), file);
}

const missingImports = [];
const apiReferences = new Set();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)) {
    const specifier = match[2];
    let key = null;
    if (specifier.startsWith("@/")) key = specifier.slice(2);
    else if (specifier.startsWith(".")) key = path.normalize(path.join(path.dirname(file), specifier));
    if (!key) continue;
    if (!modules.has(key) && !modules.has(`${key}/index`)) missingImports.push(`${file} -> ${specifier}`);
  }
  for (const match of source.matchAll(/["'](\/api\/[^"'?]+)/g)) apiReferences.add(`${file} -> ${match[1]}`);
}

const routes = new Set(
  files
    .filter((file) => file.startsWith("app/api/") && file.endsWith("/route.ts"))
    .map((file) => `/${file.slice("app/".length, -"/route.ts".length)}`),
);
const brokenApiReferences = [...apiReferences].filter((item) => {
  const route = item.slice(item.indexOf(" -> ") + 4);
  return !routes.has(route);
});
const todoStubs = files.filter((file) => /\bTODO\b|not implemented/i.test(fs.readFileSync(file, "utf8")));

const errors = [];
if (missingImports.length) errors.push(`Missing internal imports:\n${missingImports.join("\n")}`);
if (brokenApiReferences.length) errors.push(`Broken internal API references:\n${brokenApiReferences.join("\n")}`);
if (todoStubs.length) errors.push(`TODO/stub source files:\n${todoStubs.join("\n")}`);

if (errors.length) {
  console.error(errors.join("\n\n"));
  process.exit(1);
}
console.log(`Repository audit passed: ${files.length} TypeScript files, ${routes.size} API routes.`);
