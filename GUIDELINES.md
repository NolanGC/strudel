# Strudel App Builder Guidelines

This repository is becoming a scaffold for an AI app builder. The architecture
is intentionally stricter than a typical frontend app: schemas, state,
side-effects, realtime data, and tests should all compose into a system that an
AI coding agent can modify safely.

The central idea is simple:

```txt
Confect schemas are the backend source of truth.
Foldkit models/messages are the frontend state machine.
Effect services connect the two without leaking infrastructure.
Tests prove every model transition, UI path, command, and service boundary.
```

## Canonical References

Downloaded documentation snapshots live in `references/`:

- `references/foldkit-testing.html`
- `references/foldkit-core-resources.html`
- `references/foldkit-core-subscriptions.html`
- `references/effect-services.html`
- `references/effect-layers.html`
- `references/effect-schema-introduction.html`
- `references/confect-server-functions.html`
- `references/confect-server-error-handling.html`
- `references/confect-plain-convex-functions.html`
- `references/confect-client-reactivity.html`
- `references/convex-query-functions.html`
- `references/convex-mutation-functions.html`
- `references/convex-actions.html`
- `references/convex-http-actions.html`
- `references/convex-scheduled-functions.html`
- `references/convex-cron-jobs.html`
- `references/convex-file-storage.html`
- `references/convex-auth.html`
- `references/convex-component-workpool.html`

Local project references:

- `TESTING.md` explains the exhaustive testing standard.
- `src/main.ts` is the current Foldkit todo example.
- `src/todosBackend.ts` is the current Effect service boundary.
- `src/todo_tests/` shows the three-layer test structure for a feature.
- `confect/tables/todos.ts` and `confect/todos.spec.ts` show the current
  Confect source-of-truth pattern.

The Foldkit subtree under `repos/foldkit/` remains the highest-fidelity Foldkit
reference. Prefer live code and examples there over stale written notes.

## Single Source Of Truth

Confect table schemas should define the persistent domain shape.

For todos, the source starts here:

```ts
export const Todos = Table.make(
  'todos',
  Schema.Struct({
    text: Schema.String,
  }),
)
```

Function specs then refer to that table schema:

```ts
FunctionSpec.publicQuery({
  name: 'list',
  args: Schema.Struct({}),
  returns: Schema.Array(Todos.Doc),
})
```

The frontend imports the derived document schema:

```ts
export const Todo = Todos.Doc
export type Todo = typeof Todo.Type
```

That is the core rule: do not copy the todo document shape into Foldkit by hand.
If a table field changes, the table schema should change first, then the rest of
the stack should follow from Confect-generated refs, Confect specs, and imported
Effect schemas.

### What Must Not Happen

Avoid these patterns:

```ts
type Todo = {
  readonly id: string
  readonly text: string
  readonly createdAt: number
}
```

```ts
const Todo = S.Struct({
  id: S.String,
  text: S.String,
  createdAt: S.Number,
})
```

Those create a second source of truth unless they are deliberately downstream of
Confect. For this stack, duplicated schemas are architectural debt.

## Confect Responsibilities

Confect owns the backend contract:

- Table schemas.
- Function argument schemas.
- Function return schemas.
- Public/internal function grouping.
- Generated function refs.
- Convex validator generation.

Use Confect for typed queries and mutations instead of hand-writing raw Convex
function references in app code.

Current todo backend flow:

```txt
confect/tables/todos.ts
  -> confect/todos.spec.ts
  -> confect/_generated/refs.ts
  -> convex/todos.ts
  -> src/todosBackend.ts
```

The frontend service should call generated Confect refs:

```ts
confect.reactiveQuery(refs.public.todos.list)
confect.mutation(refs.public.todos.create, { text })
confect.mutation(refs.public.todos.deleteTodo, { id })
```

When adding a feature, start by deciding whether it has persistent domain data.
If it does, define or extend the Confect table first.

## Convex Backend Primitives

Convex is the runtime underneath Confect. Confect should be the default way this
app defines schemas and functions, but agents must still understand the Convex
compute model because some features need lower-level primitives.

The available backend primitives are:

- Query functions.
- Mutation functions.
- Action functions.
- HTTP actions.
- Internal functions.
- Scheduled functions.
- Cron jobs.
- File storage.
- Authentication.
- Components, including queue-like components such as Workpool.

Use the official Convex docs in `references/convex-*.html` and the Confect
companion docs in `references/confect-*.html` before implementing backend
features.

### Queries

Use queries for deterministic reads.

Queries:

- Read database state.
- Are cached and reactive.
- Must be deterministic.
- Should not call third-party APIs.
- Should not write to the database.
- Should be backed by indexes for scalable filtered reads.

In this stack, prefer a Confect `FunctionSpec.publicQuery` or internal query
when the query is part of the app API. The frontend should usually consume it
through a Confect reactive WebSocket call wrapped in an Effect service, then a
Foldkit subscription.

Todo example:

```ts
FunctionSpec.publicQuery({
  name: 'list',
  args: Schema.Struct({}),
  returns: Schema.Array(Todos.Doc),
})
```

```ts
confect.reactiveQuery(refs.public.todos.list)
```

### Mutations

Use mutations for transactional database writes.

Mutations:

- Insert, patch, replace, or delete documents.
- Run as transactions.
- Should validate all args.
- Should enforce authorization and ownership server-side.
- Should return only the data the client needs.
- Should avoid unnecessary calls to other functions because splitting
  transactional logic can introduce race conditions.

In this stack, prefer Confect mutation specs for app-owned writes:

```ts
FunctionSpec.publicMutation({
  name: 'create',
  args: Schema.Struct({ text: Schema.String }),
  returns: GenericId.GenericId('todos'),
})
```

Frontend code should call mutations through a service method, not directly from
`update` or `view`.

### Actions

Use actions for non-deterministic work and third-party side effects.

Actions are appropriate for:

- Calling external APIs.
- Sending email.
- Calling AI providers.
- Reading environment configuration.
- Running Node.js-only libraries when configured for the Node runtime.
- Coordinating work that cannot happen inside a deterministic transaction.

Actions are not a replacement for mutations. If an action needs to write
database state, have it call a mutation through Convex function references or
through the Confect-supported pattern.

Use Confect actions or Node actions when the action belongs to the app contract.
Use plain Convex functions only when Confect does not expose the needed shape or
when integrating a component/API that expects plain Convex function values.

### HTTP Actions

Use HTTP actions for external HTTP entry points.

HTTP actions are appropriate for:

- Webhooks.
- Public HTTP APIs.
- Upload callbacks.
- OAuth callbacks.
- Integrations that cannot use the Convex client protocol.

Do not use HTTP actions for ordinary app UI calls. UI calls should normally use
Confect query/mutation/action refs through the app service layer.

Confect has HTTP API documentation. Prefer Confect's Effect HTTP integration
when defining app-owned HTTP APIs, and drop to plain Convex HTTP actions when a
library or platform integration requires it.

### Internal Functions

Use internal functions for private backend APIs.

Internal functions:

- Are callable from other Convex functions.
- Are not exposed to public clients.
- Should contain sensitive implementation details.
- Are useful for scheduled work, workflow steps, component integration, and
  shared backend operations.

Never expose a function publicly just because the client does not currently call
it. If only backend code should call it, make it internal.

### Scheduled Functions

Use scheduled functions for one-off future work.

Examples:

- Send a reminder later.
- Retry a failed operation after backoff.
- Expire a pending invitation.
- Continue a multi-step process outside the original request.

Scheduling is a good fit when work should happen later and does not need to
block the user. The UI should model the pending state explicitly and subscribe
to backend state changes.

Confect has scheduling docs. Prefer Confect scheduling APIs where they cover the
use case, so specs, errors, and tests stay in the same Confect model.

### Cron Jobs

Use cron jobs for recurring backend work.

Examples:

- Nightly cleanup.
- Periodic sync.
- Recomputing aggregates.
- Sending scheduled digests.
- Expiring stale records.

Cron logic should usually call internal functions. Keep recurring work
idempotent: if the same job runs twice or partially fails, it should not corrupt
state.

### Queues And Long-Running Work

Convex actions can handle non-deterministic and longer-running work, but
complex workloads should be broken into resumable units.

For queue-like work:

- Prefer a component such as Workpool when you need prioritized queues,
  concurrency control, or background job organization.
- Use scheduled functions for simple delay/retry chains.
- Store job state in tables so progress is visible, resumable, and testable.
- Use internal mutations to claim, update, complete, or fail jobs.
- Keep UI state driven by subscribed job documents, not local timers.

Long-running work should not be hidden inside a single opaque frontend command.
Model it as backend state:

```txt
Queued -> Running -> Succeeded | Failed | Canceled
```

Then Foldkit subscribes to that state and renders progress/errors from the
model.

### File Storage

Use Convex file storage for uploaded or generated files.

Typical flow:

- A mutation/action creates or authorizes an upload.
- The client uploads a file.
- The backend stores metadata in a table.
- Queries return file metadata and storage IDs.
- HTTP actions or storage APIs serve files when needed.

Confect has storage docs. Prefer Confect storage helpers when possible, but keep
the table schema as the source of truth for file metadata that the app uses.

Do not store large blobs in normal document fields. Store metadata in tables and
binary data in file storage.

### Authentication And Authorization

Authentication identifies the user. Authorization decides what that user can do.

Convex auth rules for this repo:

- Add `convex/auth.config.ts` when auth is used.
- Use `ctx.auth.getUserIdentity()` server-side.
- For Convex Auth, prefer the stable auth user id from `getAuthUserId(ctx)` or
  the user id portion of `identity.subject`; `identity.tokenIdentifier` can
  include session identity.
- Never accept `userId` from the client for authorization.
- Enforce ownership and tenant boundaries in every protected query/mutation.

Confect has authentication docs. Use Confect's auth integration inside Confect
functions where possible, but preserve the same security rule: derive identity
on the backend, never from client arguments.

### Database Schemas, Indexes, And Limits

Convex documents are JSON-like values with system fields such as `_id` and
`_creationTime`. Confect table schemas should define the app-owned fields, and
Confect-derived document schemas should be imported into Foldkit when frontend
state contains backend documents.

Use indexes deliberately:

- Every filtered/scaled query should have a matching index.
- Index fields must be queried in the index order.
- Name indexes after all indexed fields.
- Avoid scanning large tables.

Avoid unbounded arrays in documents. Use separate tables for child records,
events, comments, tasks, or messages that can grow over time.

Check `references/convex-limits.html` before designing large payloads, high
fanout subscriptions, long actions, or file-heavy features.

### Confect Companion Map

When a Convex primitive is needed, first look for the matching Confect layer:

```txt
Convex query              -> Confect publicQuery/internalQuery specs
Convex mutation           -> Confect publicMutation/internalMutation specs
Convex action             -> Confect actions or Node actions
Convex HTTP action        -> Confect HTTP API or plain Convex HTTP action
Convex scheduled function -> Confect scheduling
Convex cron job           -> Confect cron jobs
Convex file storage       -> Confect storage
Convex auth               -> Confect authentication
Convex component          -> Confect components or plain Convex integration
```

The rule is not "never use plain Convex." The rule is: use Confect for app-owned
typed contracts, and use plain Convex for primitives Confect cannot express,
component integration, or framework-required entry points.

## Foldkit Responsibilities

Foldkit owns the application state machine:

- `Model` describes all frontend state.
- `Message` describes every fact that can enter the app.
- `update` is pure and deterministic.
- `Command` values describe one-shot effects.
- `Subscription` values describe continuous external input.
- `view` renders the current model.

Foldkit should not own backend schemas. It should consume schemas derived from
Confect where the state is backend data.

Current todo model:

```ts
export const Model = S.Struct({
  todos: S.Array(Todo),
  newTodoText: S.String,
  loadState: LoadState,
  maybeError: S.Option(S.String),
})
```

`Todo` is imported from `src/todosBackend.ts`, which derives it from
`Todos.Doc`. The model adds frontend-only state (`newTodoText`, `loadState`,
`maybeError`) around backend-owned data.

### Foldkit Best Practices

Keep these rules:

- `update` and `view` are pure.
- Messages are facts, not imperative instructions.
- Side effects live in Commands, Subscriptions, Resources, or services.
- Model updates use `evo()`, not object spreads.
- Avoid boolean soups. Prefer discriminated state.
- Use `Option` instead of `null` or `undefined`.
- Use `m()` for messages and `ts()` for tagged model variants.
- Use `keyed` views when branches have different DOM structure.
- Do not call Convex, Confect, `fetch`, `Date.now`, `Math.random`, or DOM APIs
  directly from `update` or `view`.

## Effect Responsibilities

Effect owns dependency management, error channels, streams, and replaceable
runtime services.

The current app service is:

```ts
type TodosBackendShape = {
  readonly todos: Stream.Stream<ReadonlyArray<Todo>, TodosBackendError>
  readonly create: (text: string) => Effect.Effect<TodoId, TodosBackendError>
  readonly delete: (id: TodoId) => Effect.Effect<null, TodosBackendError>
}
```

The important part is that service methods do not leak construction
dependencies. `create` requires no raw `WebSocketClient`; the live layer handles
that.

```ts
export const TodosBackendLive = Layer.effect(
  TodosBackend,
  Effect.gen(function* () {
    const confect = yield* WebSocketClient.WebSocketClient
    // build TodosBackend here
  }),
)
```

Then `entry.ts` wires the dependency graph:

```ts
resources: TodosBackendLive.pipe(
  Layer.provide(WebSocketClient.layer(convexUrl)),
),
```

This follows the Layer principle from the Effect docs: dependencies are managed
when constructing services, not exposed through every service method.

### Effect.Service Note

The current public Effect docs discuss `Effect.Service`, but this repository is
using `effect@4.0.0-beta.78`, where the installed package exposes
`Context.Service` rather than `Effect.Service`.

That means this is correct for this repo today:

```ts
export class TodosBackend extends Context.Service<
  TodosBackend,
  TodosBackendShape
>()('strudel/TodosBackend') {}
```

Do not blindly copy `Effect.Service` examples from docs until the installed
package exports that API. Verify against local `node_modules` and typecheck.

## Services And Mocking

Mock at the app-owned service boundary.

Good:

```ts
const layer = makeTodosBackendTestLayer({
  todos: Stream.empty,
  create: () => Effect.succeed(todoId('todo-created')),
  delete: () => Effect.succeed(null),
})
```

Then run the real command against the fake layer:

```ts
const message = await CreateTodo({ text: 'Write tests' }).effect.pipe(
  Effect.provide(layer),
  Effect.runPromise,
)
```

Avoid mocking:

- Confect internals in Foldkit behavior tests.
- Global clients.
- `fetch` for app-level command tests.
- Runtime singletons.

Effect makes mocking clean because service requirements are explicit in the
Effect type. Production provides `TodosBackendLive`; tests provide
`Layer.succeed(TodosBackend, fakeBackend)`.

## Realtime Data

Use Foldkit `Subscription` for realtime external input.

For todo data:

```ts
export const subscriptions = Subscription.make<Model, Message, TodosBackend>()(
  entry => ({
    todos: entry(
      {},
      {
        modelToDependencies: () => ({}),
        dependenciesToStream: () =>
          Stream.fromEffect(TodosBackend).pipe(
            Stream.flatMap(backend =>
              backend.todos.pipe(
                Stream.map(todos => LoadedTodos({ todos })),
                Stream.catch(error =>
                  Stream.succeed(FailedLoadTodos({ error: error.message })),
                ),
              ),
            ),
          ),
      },
    ),
  }),
)
```

This keeps continuous backend updates outside `update`. The subscription emits
messages, and `update` decides how those facts change the model.

Guidelines:

- Subscriptions should map external events into messages.
- Subscription failures should become failure messages.
- Do not mutate the model directly from a stream.
- Keep dependency schemas explicit so restart behavior is understandable.
- Use persistent subscriptions only for route-independent or model-independent
  streams.

## Commands

Commands describe one-shot effects caused by messages.

For todo create:

```ts
export const CreateTodo = Command.define(
  'CreateTodo',
  { text: S.String },
  CreatedTodo,
  FailedCreateTodo,
)(({ text }) =>
  Effect.gen(function* () {
    const backend = yield* TodosBackend
    yield* backend.create(text)
    return CreatedTodo()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedCreateTodo({ error: error.message })),
    ),
  ),
)
```

Best practices:

- Name commands verb-first.
- Return success/failure messages.
- Catch expected service failures and return `Failed*` messages.
- Do not let normal production failures crash the app.
- Do not perform effects in `update`; return commands from `update`.

## Error Handling

Errors should remain typed as long as possible.

The backend service defines:

```ts
export class TodosBackendError extends Data.TaggedError('TodosBackendError')<{
  readonly operation: BackendOperation
  readonly message: string
  readonly cause: unknown
}> {}
```

This preserves:

- Which backend operation failed.
- The user-facing message.
- The original cause for debugging.

Foldkit messages then carry display-safe strings:

```ts
export const FailedCreateTodo = m('FailedCreateTodo', { error: S.String })
```

This split is intentional. The service boundary can keep richer failure
information; the model stores the UI-facing failure.

## Testing Standard

Read `TESTING.md` before adding features.

The current todo tests are grouped by testing layer:

```txt
src/todo_tests/
  todo.update.story.test.ts
  todo.scene.test.ts
  todo.command.test.ts
```

Each feature should grow the same way:

- Story tests for pure model/message/update behavior.
- Scene tests for rendered UI, user paths, and visible errors.
- Command tests for Effect service interactions.
- Subscription tests for stream success/failure/replacement behavior.
- Backend tests for Confect/Convex function behavior.

Do not merge a feature that only tests the happy path. Error paths and visible
UI failures are product behavior.

## Feature Development Procedure

Use this order for new app-builder features:

1. Decide which Convex primitive is needed: query, mutation, action, HTTP
   action, scheduled function, cron job, storage, auth, or component.
2. Decide whether Confect can express it directly. Prefer Confect for app-owned
   contracts.
3. Define backend domain data in Confect tables.
4. Define Confect function specs.
5. Implement Confect functions or plain Convex functions where explicitly
   required.
6. Generate Confect/Convex artifacts.
7. Create or extend an app-owned Effect service.
8. Import Confect-derived schemas into Foldkit models/messages.
9. Add messages for every user or external fact.
10. Add pure update transitions.
11. Add commands and subscriptions for side effects.
12. Render the model in `view`.
13. Add update/story tests.
14. Add scene/UI tests.
15. Add command/service tests.
16. Add subscription tests if realtime data is involved.
17. Add backend integration tests for function behavior.
18. Run typecheck, tests, and build.

## What AI Agents Must Avoid

AI agents are likely to make these mistakes:

- Defining frontend schemas that duplicate Confect schemas.
- Editing generated Confect or Convex files by hand.
- Calling backend clients directly from views or update functions.
- Adding untyped plain objects instead of Schema-backed messages/model fields.
- Mocking the wrong layer.
- Handling only success paths.
- Hiding errors instead of rendering them.
- Adding state that permits impossible combinations.
- Using current web docs without checking installed package APIs.
- Skipping test updates because the app still builds.
- Using a mutation for external API calls that belong in an action.
- Using an action for transactional database logic that belongs in a mutation.
- Exposing backend-only functions as public functions.
- Accepting `userId` or tenant IDs from the client for authorization.
- Storing unbounded child lists or blobs inside normal documents.
- Hiding long-running work inside one opaque command instead of modeling job
  state.

The antidote is mechanical discipline: every feature touches schema, service,
Foldkit state machine, UI, and tests in a predictable sequence.

## Why This Stack Is Powerful

Confect gives the backend a schema-first contract.

Effect gives the app typed effects, dependency injection, streams, layers, and
testable services.

Foldkit gives the frontend a pure state machine: a single model, explicit
messages, deterministic update, and a view derived from state.

Together, they create a scaffold where an AI coding agent can make incremental
changes without guessing as much:

```txt
schema defines data
spec defines backend contract
service defines app boundary
message defines facts
update defines behavior
view defines UI
tests prove the graph
```

That is the standard for this repo.
