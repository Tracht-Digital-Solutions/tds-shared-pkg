/**
 * Passenger startup file. **CommonJS on purpose — do not rename to `.js`.**
 *
 * Phusion Passenger loads the application with `require(startupFile)`. This
 * package is `"type": "module"`, so a `.js` startup file is ESM and `require`
 * of it fails with `ERR_REQUIRE_ESM` — which Passenger surfaces as its
 * generic "something went wrong" page, with the real cause only in the app
 * log. Node 22's `require(esm)` support does not rescue it either: it throws
 * as soon as anything in the graph uses top-level await.
 *
 * Importing the server is all that is needed. In `@astrojs/node`'s standalone
 * mode the module creates the `http.Server` and calls `listen()` as an import
 * side effect — and Passenger patches `http.Server.prototype.listen` to
 * discard the port/host arguments and bind its own unix socket instead. So
 * there is no `PORT` to read and none to set: Passenger inverts the control,
 * and any `HOST`/`PORT` in the environment here is decoration.
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";

// Passenger already chdir()s to the application root, but pin it anyway: a
// couple of build-only helpers resolve paths against process.cwd(), and a
// wrong cwd would turn those into a runtime ENOENT far from its cause.
process.chdir(__dirname);

import("./server/entry.mjs").catch((err) => {
  // Friendly error pages are off in production, so this line is the only
  // breadcrumb an operator gets. Passenger routes stderr into the app log.
  console.error("[tds] Astro server failed to start:", err);
  process.exit(1);
});
