# Field Lab deployment

The build workflow compiles the actual engine, runs deterministic WASM tests, and tests
the browser controls at desktop and mobile viewport sizes. Browser screenshots are
uploaded as the field-lab-browser-evidence artifact. Pull requests only build and test.

To publish at https://islandyout.github.io/engine/:

1. In repository Settings > Pages > Build and deployment, select **GitHub Actions**.
2. Merge the reviewed deployment PR into main.
3. Open Actions > Field Lab browser build and verify the build and deploy jobs pass.
   If the workflow already ran before the settings change, use Run workflow on main.

The deploy job uses the github-pages environment with pages:write and id-token:write;
repository contents remain read-only. Only main can publish. Failed tests prevent
deployment. Keep environment protection rules intact and approve a deployment if a
configured environment review requires it.

The existing README remains repository documentation. The deployed artifact root contains
the playable index.html and its compiled engine.js, lab.js, and style.css.

This browser view demonstrates the engine foundation. It does not implement the native
renderer or production physics.
