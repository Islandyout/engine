# Third-Party Dependencies

Dependencies are pinned and fetched through CMake. Runtime/game code depends on engine-owned interfaces rather than third-party APIs wherever practical.

| Dependency | Pinned version | License | Purpose |
|---|---:|---|---|
| SDL | 3.4.14 (`release-3.4.14`) | zlib | Desktop window, operating-system events, and future input/platform integration |

SDL is built statically for the current development configuration. Its tests and examples are disabled in the parent build. The headless platform and core/runtime tests do not require a visible desktop window.
