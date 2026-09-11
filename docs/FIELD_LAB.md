# Field Lab: visible engine verification

The browser demonstration links the repository's F3 input state, F4 ActionSystem and
InputReplay, F5 World and FixedSystems, and FixedStepClock. JavaScript draws the state
returned by the compiled C++ module. There is no JavaScript replacement for those systems.

The field uses integer position units for reproducible movement. Signals are simple
distance-triggered entities, not physics bodies; crates demonstrate deferred spawning and
are not colliders. World coordinates remain fixed when the presentation camera rotates.

Each simulation tick consumes pending keyboard events. Events survive display frames with
zero ticks; catch-up ticks do not repeat press edges. Record resets the field and captures
the input sequence, including spawn and control-block toggles. Replay resets the world and
injects those events at the recorded ticks. Its end-state fingerprint hashes ordered
component values, collection count, and context activation, excluding process-local handles.
It is a diagnostic checksum, not a cryptographic proof or network lockstep guarantee.

Limits: 1,800 recording ticks (30 seconds), 128 entities, 256 pending events, and the
existing fixed-clock catch-up cap. Recordings stay in tab memory and do not survive reload.
Reset preserves the last recording so it can be replayed. Replaying freezes at the recorded
end; reset restores live input. The guided run is a predefined engine InputReplay sequence.

Node tests execute the compiled WASM artifact and cover movement, input surviving zero-tick
frames, context masking, deferred spawn, reset, repeated user-input replay, and guided replay.
The native libraries and build dependency boundaries are unchanged; the browser build is
an opt-in Emscripten command, independent of native SDL builds.

Deployment output is the contents of `build/field-lab`; serve `index.html`, `style.css`,
`lab.js`, and generated `engine.js` together. The single-file engine module embeds WASM
and needs neither cross-origin isolation nor a separate WASM MIME configuration.
