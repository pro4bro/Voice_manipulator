import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { parseSync } from "rolldown/utils";

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /(?<!\.test)\.tsx$/u.test(entry.name) ? [path] : [];
  });
}
function children(node) {
  return Object.values(node).flatMap((value) => Array.isArray(value) ? value.filter((item) => item?.type)
    : value && typeof value === "object" && value.type ? [value] : []);
}
function walk(node, callback) { callback(node); for (const child of children(node)) walk(child, callback); }
function violations(source, name = "fixture.tsx") {
  const parsed = parseSync(name, source);
  expect(parsed.errors).toEqual([]);
  const declarations = new Map();
  walk(parsed.program, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier") declarations.set(node.id.name, node.init);
    if (node.type === "FunctionDeclaration" && node.id) declarations.set(node.id.name, node.body);
  });
  function resolved(node, seen = new Set()) {
    if (!node) return false;
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && ["readableColor", "emotionVisualStyle"].includes(node.callee.name)) return true;
    if (node.type === "Identifier" && !seen.has(node.name)) {
      seen.add(node.name);
      if (resolved(declarations.get(node.name), seen)) return true;
    }
    return children(node).some((child) => resolved(child, seen));
  }
  const failures = [];
  walk(parsed.program, (node) => {
    if (node.type !== "JSXAttribute" || node.name.name !== "style" || node.value?.type !== "JSXExpressionContainer") return;
    const style = node.value.expression;
    if (style.type !== "ObjectExpression") return;
    for (const property of style.properties) {
      if (property.type !== "Property" || (property.key.name ?? property.key.value) !== "color") continue;
      // Static CSS values have a separate semantic palette/cascade gate.
      if (property.value.type === "Literal" || resolved(property.value)) continue;
      failures.push(`${name}: ${source.slice(property.value.start, property.value.end)}`);
    }
  });
  return failures;
}

it("rejects new raw profile foregrounds, including aliases, and accepts resolved ones", () => {
  expect(violations('<button style={{color: profile.color}}>text</button>')).toHaveLength(1);
  expect(violations('const tint=profile.color;const view=<button style={{color:tint}}>text</button>')).toHaveLength(1);
  expect(violations('<button style={{color: readableColor(profile.color, palette.word)}}>text</button>')).toEqual([]);
});
it("routes direct dynamic inline text foregrounds throughout the product through contrast resolution", () => {
  const failures = sources(resolve(process.cwd(), "src")).flatMap((path) => violations(readFileSync(path, "utf8"), path));
  expect(failures).toEqual([]);
});
