const vm = require('node:vm');

// Keep the existing isolated unit harnesses synchronous. Only the app's static import/export declarations
// are adapted; dependencies are explicit namespace stubs, and the production function bodies run unchanged.
function loadModule(source, { imports = {}, globals = {}, filename = 'module.js' } = {}) {
  const exported = [];
  const names = (list) => list.split(',').map((name) => name.trim()).filter(Boolean).map((name) => {
    const match = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(name);
    if (!match) throw new Error(`Unsupported module binding: ${name}`);
    return [match[1], match[2] || match[1]];
  });
  let code = source.replace(/^import\s+(\*[\s\S]*?|\{[\s\S]*?\})\s+from\s+(['"])([^'"\n]+)\2\s*;/gm, (_declaration, bindings, _quote, specifier) => {
    if (!Object.hasOwn(imports, specifier)) throw new Error(`Missing import stub: ${specifier}`);
    const namespace = /^\*\s+as\s+([\w$]+)$/.exec(bindings.trim());
    const target = `imports[${JSON.stringify(specifier)}]`;
    if (namespace) return `const ${namespace[1]} = ${target};`;
    const fields = names(bindings.slice(1, -1)).map(([name, local]) => `${name}: ${local}`);
    return `const { ${fields.join(', ')} } = ${target};`;
  });
  code = code.replace(/^export\s*\{([^}]+)\}\s*;/gm, (_declaration, bindings) => {
    exported.push(...names(bindings));
    return '';
  });
  code = code.replace(/^export\s+(const|let|var|function|class)\s+([\w$]+)/gm, (_declaration, kind, name) => {
    exported.push([name, name]);
    return `${kind} ${name}`;
  });
  if (/^\s*(?:import|export)\b/m.test(code)) throw new Error(`Unsupported module syntax in ${filename}`);
  const properties = exported.map(([local, name]) => `${JSON.stringify(name)}: ${local}`).join(', ');
  const evaluate = vm.runInNewContext(`(function (imports) { 'use strict';\n${code}\nreturn { ${properties} };\n})`, globals, { filename });
  return evaluate(imports);
}

module.exports = { loadModule };
