# F5 world foundation contract

## Scope and backend decision

F5 establishes world/entity ownership, component registration, and deterministic sequential
fixed-step execution. There is no rendering, physics, planet support, scene authoring,
hierarchy, asset loading, job scheduling, or gameplay in this module.

The earlier roadmap suggested introducing Flecs here. This milestone deliberately defers
that dependency: the implementation uses standard C++ ordered containers to establish a
small, testable engine-owned contract while keeping headless builds dependency-free.
This is a correctness baseline, not an optimized archetype ECS. Querying scans living
entities and allocates a snapshot; component lookup is logarithmic. A later measured backend
integration must preserve ownership and observable ordering and requires its own dependency
pin, licensing review, and performance tests. No Aether source was copied.

`GameEngine::World` depends on the existing runtime/core/platform interfaces, not SDL.
Consumers include `engine/world/world.hpp` or `engine/world/fixed_systems.hpp`.

## Identity and ownership

- `World` is neither copyable nor movable. It owns all registered component stores and values.
- `Entity` is an opaque transient handle containing a process-local world identity and a
  monotonically allocated serial. It is deliberately distinct from the existing persistent
  UUID-based `EntityId` and `WorldId` vocabulary; no persistence mapping is implemented.
- Destroyed entity serials are never reused. Reset does not rewind allocation. Destroying and
  reconstructing a world allocates a fresh owner identity. Exhaustion throws rather than wraps.
- Default, stale, and foreign handles cannot access or mutate a living replacement entity.
  `alive` returns false, `get` returns null, and `destroy`/`remove` return false for nonliving
  handles. `set` rejects them with `invalid_argument`.
- Worlds and system registries are single-threaded. The atomic owner allocator only ensures
  distinct identities; it does not make concurrent world mutation safe.
- Handle numeric identity is not replay-stable across world instances. Query order within a
  world is creation/reservation order, independent of global owner allocation and pointer values.

## Components and queries

Register each unqualified C++ object value type once with a unique explicit name. Names contain 1–128 ASCII
letters, digits, underscores, dots, or hyphens. Duplicate names/types and unregistered type
access throw `invalid_argument`. Metadata names are returned in lexical order. RTTI is used
only for type lookup, never as a serialized identifier or execution-order key.

`set<T>` inserts or replaces a value; `get<T>` returns a nullable pointer with const overloads.
Types used by `set` must be move-constructible and move-assignable. The current type-erased
deferred queue additionally requires copy-constructible values. No component reflection,
serializer, runtime dynamic schema, or implicit registration exists.

`query<T...>` returns a caller-owned snapshot containing living entities with every requested
component. `query<>` returns all living entities. It has no mutable internal query-cache alias.
Snapshots do not keep entities alive: callers must revalidate handles after structural changes.
Component pointers must not be retained across component removal, entity destruction, reset,
or world destruction. Component values and pending captured values are released by RAII.

## Deferred changes and reset

Changes are one FIFO stream in enqueue order, not reordered by component type or entity.
`defer_create` reserves a handle immediately but it is not alive until committed. It can be
used by later queued `defer_set` commands. Commands directed at already destroyed/canceled
same-world handles are no-ops at commit; foreign/default handles are rejected when enqueued.
Thus create → set → destroy → set ends destroyed, with no resurrection or ghost component.

Outside system execution, `flush` commits pending commands. `reset` discards pending commands,
destroys every living entity/component value, and keeps component registrations. It does not
reset an application tick counter, the system registry, or system activation. Old and canceled
handles remain invalid even after subsequent creations.

While systems run, direct create/set/remove/destroy/reset/register/flush operations throw
`logic_error`; use the deferred APIs instead. Editing an existing component through its pointer
is allowed and immediately visible to later systems in that phase. Queued structural changes
are invisible until the boundary. No user lifecycle hooks or concurrent mutation are supported.

## Fixed execution

Call `FixedSystems::run(world, context)` once from `ApplicationCallbacks::on_fixed_update`.
The application owns the accumulator, constant fixed delta, tick sequence, catch-up cap,
and input snapshot. The system executor forwards the supplied context unchanged, rejects
nonpositive deltas, and does not accumulate wall time, deduplicate ticks, or simulate rendering.
Direct test callers are responsible for supplying the desired fixed tick sequence.

1. Commit commands queued before the tick.
2. Run `begin` systems, then commit their commands.
3. Run `update` systems, then commit their commands.
4. Run `end` systems, then commit their commands.

Each phase sorts by ascending signed numeric order, then lexical unique system name.
Registration order is not a tie-breaker. Activation is explicit and may change between runs,
not inside callbacks. Invalid phases, duplicate names, empty functions, and unknown activation
targets are rejected. Recursive execution of a registry, or overlapping execution of the same
world through a different registry, is rejected.

If a callback throws, remaining callbacks are skipped, uncommitted commands are discarded,
execution guards are released, and the exception propagates to the application. This is not
a transaction: earlier component-value edits and completed phases remain committed. If a
component operation throws during flush, the already committed command prefix remains and
the remaining queue is discarded. Recovery can explicitly reset the world; there is no rollback.

Deterministic ordering does not guarantee cross-platform floating-point equality, network
lockstep, deterministic arbitrary user callbacks, or deterministic external I/O. Systems must
avoid wall clocks, unseeded randomness, and nondeterministically ordered external data when
reproducibility matters.

## Tests

`engine_world_tests` covers seven groups: registration/ownership, reset/deferred changes,
stable scheduling, phase visibility/guards, callback failures, resource lifetime/flush failures,
and application integration. Integration compares twelve identical fixed ticks at 5 ms,
10 ms, and 30 ms render intervals, exercising both frames with no tick and catch-up frames.
All tests run without SDL; existing SDL dummy-driver tests remain the platform-boundary gate.
