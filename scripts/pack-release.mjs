/**
 * Assemble the deployable tree the production host checks out.
 *
 * Runs as `postbuild`, so `npm run build` alone produces everything the host
 * needs and CI has nothing site-specific to remember.
 *
 * ### Why this exists at all
 *
 * The host runs the site as a Node app under Passenger, and it must be able to
 * start it **without `npm install`**. Our own packages live on GitHub
 * Packages, so any install on the host would need a PAT with `read:packages`
 * on a machine that has no business holding one. The answer is two-tier:
 * everything first-party is bundled into `server/` by `vite.ssr.noExternal`
 * (see `astro.config.mjs`), and the small remainder that *cannot* be bundled —
 * native addons, and packages whose CJS interop does not survive Rollup — is
 * installed here, on the CI runner, from the public registry only, and shipped
 * inside the release tree.
 *
 * ### The layout, and why it is not negotiable
 *
 *   app.cjs        Passenger startup file (CommonJS — see the file's own note)
 *   package.json   minimal, public-registry deps only
 *   server/        the SSR bundle. NOT web-reachable: document root is client/
 *   client/        document root — hashed assets, prerendered pages, .htaccess
 *   node_modules/  prebuilt, linux-x64, no first-party packages
 *   tmp/           so `touch tmp/restart.txt` works as a deploy action
 *
 * `server/` and `client/` must stay siblings under exactly those names:
 * `@astrojs/node` resolves the client directory at runtime by walking up from
 * its own module URL to the folder named like `build.server` and applying the
 * server→client offset. Flattening `client/` into the tree root breaks static
 * serving in a way that only shows up on the host.
 *
 * ### Where this file lives
 *
 * It used to be copied into each site that needed it, with the instruction
 * "fix it once, copy it three times; do not fork it" — an instruction that
 * does not survive a fifth copy, which is what the two panel products would
 * have made it. It is published from `tds-shared` instead and consumed as
 *
 *     "postbuild": "node node_modules/@tracht-digital-solutions/tds-shared/scripts/pack-release.mjs"
 *
 * There is no `exports` entry for it and none is needed: `node <path>` is a
 * filesystem lookup, not specifier resolution. The per-consumer values come
 * from `tds.release` in `package.json`, the same convention
 * `scripts/lint-primitives.mjs` uses.
 *
 * The three public sites still carry their own copy at `<repo>/scripts/`; both
 * paths behave identically (see the `root` and `app.cjs` notes below), so they
 * can drop theirs whenever it suits, not as part of a release.
 */

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

// The CONSUMER's root, not this script's. npm sets the cwd of every lifecycle
// script to the package root, so for a site that still keeps its own copy at
// `<repo>/scripts/` this is the identical path the old derivation produced —
// the change is a no-op there and the correct value from `node_modules`.
const root = process.cwd();
const dist = join(root, "dist");
const out = join(root, "release");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const config = pkg.tds?.release;
if (!config) {
  console.error("[pack-release] package.json has no `tds.release` section.");
  process.exit(1);
}

// A build that produced no server bundle is a build that silently stayed
// static — the single most likely way this migration regresses, and one that
// would otherwise ship a tree Passenger cannot start.
for (const required of ["server/entry.mjs", "client"]) {
  if (!existsSync(join(dist, required))) {
    console.error(
      `[pack-release] dist/${required} is missing. Is \`output: "server"\` still set, ` +
        "and is the Node adapter still configured?",
    );
    process.exit(1);
  }
}

try {
  // Retries absorb the transient locks a virus scanner or an editor takes on
  // a freshly written tree; a server still running out of `release/` holds it
  // for good, which is what the message below is for.
  rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch (err) {
  console.error(
    `[pack-release] could not clear ${out}: ${err?.code ?? err}\n` +
      "  On Windows this is almost always a smoke-test server still running " +
      "out of that directory — stop it and build again.",
  );
  process.exit(1);
}
mkdirSync(out, { recursive: true });

cpSync(join(dist, "server"), join(out, "server"), { recursive: true });
cpSync(join(dist, "client"), join(out, "client"), { recursive: true });
// A consumer may keep its own startup file — the three public sites do, and
// theirs is byte-identical to the canonical one shipped beside this script.
// The panel products have none, for the same reason they have no `src/`: they
// are composition repos and own no application source at all.
const appEntry = existsSync(join(root, "app.cjs"))
  ? join(root, "app.cjs")
  : fileURLToPath(new URL("app.cjs", import.meta.url));
cpSync(appEntry, join(out, "app.cjs"));

mkdirSync(join(out, "tmp"), { recursive: true });
writeFileSync(join(out, "tmp", ".gitkeep"), "");
// Passenger watches this conventional file. A unique value on every build
// makes a Git pull recycle the worker instead of serving the previous SSR
// manifest beside freshly deployed client assets.
writeFileSync(join(out, "tmp", "restart.txt"), `built_at=${new Date().toISOString()}\n`);

// This tree IS the deployable artefact, node_modules included — the host must
// not have to install anything. The un-ignore is insurance against a global
// or inherited ignore rule quietly dropping it from the published branch,
// which would leave the host with an app that cannot resolve `astro`.
writeFileSync(
  join(out, ".gitignore"),
  "# The release branch ships the runtime. Nothing here is ignorable.\n!node_modules/\n",
);

// Files a server-rendered route reads from disk at runtime.
//
// Anything resolved against `process.cwd()` is resolved against the PROJECT
// ROOT during the build and against the DEPLOY TREE on the host — and the
// deploy tree has no `src/`. The landingpage's committed fallback AGB is the
// live example: server-rendered, it silently 404'd in production, which is
// precisely the outcome a committed fallback exists to prevent.
for (const { from, to } of config.extraFiles ?? []) {
  const source = join(root, from);
  if (!existsSync(source)) {
    console.error(`[pack-release] tds.release.extraFiles: ${from} does not exist`);
    process.exit(1);
  }
  cpSync(source, join(out, to), { recursive: true });
  console.log(`[pack-release] copied ${from} -> ${to}`);
}

// `"type": "commonjs"` so Passenger's require() of app.cjs is unambiguous even
// if the file is ever renamed. No first-party dependency may appear here: that
// is the whole point of the exercise, and the CI gate greps for it.
writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: config.name,
      version: pkg.version,
      private: true,
      type: "commonjs",
      scripts: { start: "node app.cjs" },
      dependencies: config.runtimeDependencies ?? {},
    },
    null,
    2,
  ) + "\n",
);

const deps = Object.keys(config.runtimeDependencies ?? {});
if (deps.length > 0) {
  console.log(`[pack-release] installing runtime dependencies: ${deps.join(", ")}`);
  // A literal command string through the shell, rather than execFileSync with
  // an argument array. Two Windows-only reasons, and CI is Linux, so this path
  // exists purely so a local build produces the same tree the host gets:
  // since Node 20 a `.cmd` cannot be spawned directly (bare EINVAL naming the
  // syscall, not the cause), and passing an argument array *with* `shell: true`
  // earns a DEP0190 warning on every build. Nothing here is interpolated.
  execSync("npm install --omit=dev --no-package-lock --no-audit --no-fund", {
    cwd: out,
    stdio: "inherit",
  });
}

verify();

console.log(`[pack-release] release tree ready at ${out}`);

/**
 * Prove the tree can actually start on the host.
 *
 * These run on every build, not only in CI: a gate that lives in a workflow is
 * a gate that surprises you in a workflow, and each of these failures is
 * invisible until the site is already deployed and dead.
 */
function verify() {
  const problems = [];

  for (const required of ["app.cjs", "server/entry.mjs", "client/.htaccess"]) {
    if (!existsSync(join(out, required))) problems.push(`release/${required} is missing`);
  }

  // A first-party import surviving into the server bundle means the host would
  // need a GitHub Packages token to boot — add the package to
  // `vite.ssr.noExternal` in astro.config.mjs.
  //
  // Match IMPORT STATEMENTS, not the bare package name. Astro's client
  // hydration manifest maps module specifiers to emitted asset paths, so
  // `"@tracht-digital-solutions/tds-shared/components":"_astro/index.…js"`
  // appears in entry.mjs as DATA on every healthy build. A grep for the name
  // alone would fail this check forever, for a string that is not an import.
  // Static and dynamic imports are scanned separately, because they fail
  // differently and one of them has a legitimate exception.
  //
  // A STATIC import is resolved when the module loads: missing, it is an
  // ERR_MODULE_NOT_FOUND before the server can answer anything.
  //
  // A DYNAMIC import is resolved when the line RUNS. The tool packs use that
  // deliberately — `pdfjs-dist` and `tesseract.js` are megabyte-sized
  // browser-only engines fetched inside a click handler, so the server bundle
  // mentions them and never executes them. Shipping those to the host would
  // add tens of megabytes to every deploy for code that cannot run there.
  // They are allowed to be absent, but only by NAME in `tds.release.browserOnly`,
  // so the exception is a recorded decision rather than a silent hole.
  const staticRe = /\bfrom\s*["']([^"']+)["']/g;
  const dynamicRe = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
  const browserOnly = new Set(config.browserOnly ?? []);
  const forbidden = [
    { test: (s) => s.startsWith("@tracht-digital-solutions/"), why: "first-party package" },
    { test: (s) => s === "satori" || s.startsWith("@resvg/"), why: "build-only OG renderer" },
  ];

  // Every bare specifier the bundle still imports has to resolve inside THIS
  // tree. The host has no parent directory to fall back on, so anything
  // missing here is an ERR_MODULE_NOT_FOUND on its first request in
  // production — and locally it is worse than an error: Node walks up and
  // finds the development checkout's node_modules, which loaded a SECOND copy
  // of React and made every island hook throw "Cannot read properties of null
  // (reading 'useState')" from a stack that names neither cause.
  const unresolved = new Set();
  const unresolvedLazy = new Set();
  const seen = new Set();

  const consider = (specifier, file, lazy) => {
    const hit = forbidden.find((f) => f.test(specifier));
    if (hit) problems.push(`server bundle imports ${specifier} (${hit.why}): ${file}`);

    if (specifier.startsWith(".") || specifier.startsWith("node:")) return;
    // The regexes also match the word "from" inside ordinary string content —
    // minified German copy managed `…, hourSuffix: "…` — so the capture has to
    // look like a module specifier before it is believed.
    if (!/^[@a-zA-Z0-9][@a-zA-Z0-9._~/-]*$/.test(specifier)) return;
    if (isBuiltin(specifier)) return;

    const name = packageOf(specifier);
    const key = `${lazy ? "lazy:" : "static:"}${name}`;
    if (seen.has(key)) return;
    seen.add(key);

    if (existsSync(join(out, "node_modules", name))) return;
    if (lazy) {
      if (!browserOnly.has(name)) unresolvedLazy.add(name);
    } else {
      unresolved.add(name);
    }
  };

  for (const file of walk(join(out, "server"))) {
    const source = codeOnly(readFileSync(file, "utf8"));
    for (const match of source.matchAll(staticRe)) consider(match[1], file, false);
    for (const match of source.matchAll(dynamicRe)) consider(match[1], file, true);
  }

  for (const specifier of [...unresolved].sort()) {
    problems.push(
      `server bundle imports "${specifier}" statically, and it is not in the release ` +
        "tree — add it to tds.release.runtimeDependencies, or bundle it via " +
        "vite.ssr.noExternal",
    );
  }

  for (const specifier of [...unresolvedLazy].sort()) {
    problems.push(
      `server bundle lazily imports "${specifier}", which is not in the release tree. ` +
        "If that code path can run on the server, ship it in " +
        "tds.release.runtimeDependencies; if it is browser-only (a click handler " +
        `in a client island), record it in tds.release.browserOnly as "${specifier}".`,
    );
  }

  const shipped = JSON.parse(readFileSync(join(out, "package.json"), "utf8"));
  for (const name of Object.keys(shipped.dependencies ?? {})) {
    if (name.startsWith("@tracht-digital-solutions/")) {
      problems.push(`release/package.json depends on ${name}; the host has no registry token`);
    }
  }

  if (problems.length > 0) {
    console.error("[pack-release] the release tree would not start on the host:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("[pack-release] verified: self-contained, no first-party or native OG imports");
}

/**
 * Drop comment lines before looking for imports.
 *
 * Rollup keeps the original JSDoc, and library documentation is full of
 * `@example` blocks containing real-looking import statements — framer-motion
 * ships two. Scanning them reported a bundled package as missing from the
 * release tree, i.e. a build that failed for a line of prose.
 *
 * Line-based rather than a comment parser: Astro's SSR output is unminified,
 * one statement per line, and a parser here would be more machinery than the
 * question deserves.
 */
function codeOnly(source) {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

/** `motion/react` → `motion`, `@hookform/resolvers/zod` → `@hookform/resolvers`. */
function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Node builtins, with or without the `node:` prefix. */
function isBuiltin(specifier) {
  return builtinModules.includes(packageOf(specifier));
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(mjs|js|cjs)$/.test(entry.name)) yield full;
  }
}
