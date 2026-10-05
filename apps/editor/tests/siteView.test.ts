import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSiteView } from "../src/editor/siteView";

test("the site view opens on home and follows the selection", () => {
  const options = ["all", "home", "4", "9"];
  let state = nextSiteView({ view: "all", defaulted: false }, true, undefined, options);
  assert.deepEqual(state, { view: "home", defaulted: true }, "a scene with Sites opens on home");
  state = nextSiteView(state, true, "9", options);
  assert.equal(state.view, "9", "selecting something at a site shows that site");
  state = nextSiteView({ view: "all", defaulted: true }, true, "4", options);
  assert.equal(state.view, "all", "everything stays everything");
  state = nextSiteView({ view: "7", defaulted: true }, true, undefined, options);
  assert.equal(state.view, "all", "a site that's gone falls back");
  assert.deepEqual(nextSiteView(state, false, undefined, []), { view: "all", defaulted: false });
});
