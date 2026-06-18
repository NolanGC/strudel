# Process

This scaffold is for building Foldkit + Confect apps with Effect. Treat it as a high-discipline app factory: tests first, typed effects everywhere, explicit backend contracts, and no fake shortcuts.

## 0. The Outer Loop

Before writing code, understand the app request. Do not jump directly into components.

Break the request into:

- Pages: routes or screens the user will visit.
- Features: concrete workflows users can complete.
- Data: durable records, ownership, indexes, relationships, optional fields, system tables.
- Infrastructure: auth, storage, scheduling, cron jobs, HTTP endpoints, actions, search, environment variables, components.
- Backend API: Confect specs, typed args, typed returns, typed errors, public/internal boundaries.
- Frontend state: Foldkit models, tagged states, submodels, parent/child message boundaries, out messages.
- Side effects: commands, services, subscriptions, file reads, uploads, navigation, timers.
- UI: accessible controls and rendered state for each workflow.
- Tests: update, scene, command, Confect integration, typecheck, full suite.

Translate the app into architecture before implementation:

```text
user request
  -> pages
  -> features/workflows
  -> Convex/Confect tables, indexes, storage, scheduler, auth, HTTP, actions
  -> Confect specs and impls
  -> Foldkit models, submodels, messages, commands, subscriptions
  -> views and accessible UI
  -> tests for each layer
```

Then create a task list. Each task should be small enough to test and finish:

```text
1. Write failing Confect tests for ownership and typed errors.
2. Add table/spec/impl and run codegen.
3. Write failing Story tests for update behavior.
4. Implement model/messages/update.
5. Write failing command tests for service calls.
6. Implement frontend service and commands.
7. Write failing Scene tests for the workflow.
8. Implement view.
9. Run typecheck, focused tests, full tests, lint.
```

Proceed task by task. Do not mark a task complete until its tests pass. If one layer reveals a missing requirement, update the task list and keep moving. Multiple passes are normal.

Use subagents when useful to speed up independent work: one can inspect docs, one can audit tests, one can review backend contracts, one can check UI accessibility. Do not outsource final judgment. The main builder must integrate the result and run the checks.

## 1. Test Driven Development

Write tests before implementation. A feature is not started until its desired behavior is described in executable tests.

Use focused test folders per feature:

```text
src/todo_tests/
src/auth_tests/
src/cron_todo_tests/
src/<feature>_tests/
```

Use all available test layers:

- `Story.story` for pure Foldkit update tests: messages in, model and commands out.
- `Scene.scene` for user-facing behavior through the view: accessible labels, buttons, rendered state, file changes, form submission, command dispatch.
- Command tests for service boundaries: provide test layers and verify commands call services with the right args and map failures into failure messages.
- `@confect/test` for backend behavior: auth identity, typed errors, database reads/writes, scheduled functions, storage-adjacent behavior, and generated refs.
- `tsc --noEmit && tsc -p confect/tsconfig.json` as a required test. Runtime tests are not a substitute for typechecking Confect code.

Read the docs when unsure:

- Foldkit examples and source: `repos/foldkit/examples/`, `repos/foldkit/packages/foldkit/src/`
- Confect docs index: https://confect.dev/llms.txt
- Confect testing: https://confect.dev/guides/testing
- Confect functions: https://confect.dev/server/functions
- Confect error handling: https://confect.dev/server/error-handling
- Confect storage: https://confect.dev/server/storage
- Confect scheduling: https://confect.dev/server/scheduling

Minimum feature test checklist:

- Update tests for every new message branch.
- Scene tests for every visible workflow.
- Command tests for every side effect.
- Confect tests for every public query/mutation/action, including auth failure and ownership.
- Typecheck both frontend and Confect backend.
- Full test suite before reporting done.

Expect multiple passes. A serious feature often needs one pass for tests, one for backend contracts, one for frontend wiring, one for typecheck fallout, one for behavior gaps discovered by tests, and one for cleanup. That is not failure. That is the process working. Do not compress this into one fake-perfect generation. Move in verified increments.

Run:

```bash
bun run typecheck
bun run test
bun run lint
```

If a behavior cannot be tested honestly in the current harness, say so clearly. Do not pretend coverage exists. Example: direct Convex storage upload URLs may not be routable through `convex-test`; test the typed Confect mutations and the frontend upload service boundary separately.

## 2. Effectful By Default

All services and side effects should be Effectful. Effect is not decoration; it is how this app makes errors, dependencies, retries, async work, and testability explicit.

Good pattern:

```ts
export class TodoStorageError extends Schema.TaggedErrorClass<TodoStorageError>()(
  'TodoStorageError',
  {
    operation: TodoOperation,
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

const create = FunctionImpl.make(api, 'todos', 'create', ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter
    const ownerUserId = yield* currentUserId

    return yield* writer
      .table('todos')
      .insert({ ownerUserId, text })
      .pipe(
        Effect.catchTags({
          DocumentEncodeError: error =>
            Effect.fail(
              new TodoStorageError({
                operation: 'CreateTodo',
                message: error.message,
                userMessage: 'Could not sync todos.',
              }),
            ),
        }),
      )
  }),
)
```

Bad patterns:

```ts
try {
  await doThing()
} catch {
  return 'something went wrong'
}
```

```ts
Effect.catchAll(() =>
  Effect.fail(new StorageError({ message: 'failed' })),
)
```

```ts
Effect.orDie(errorThatTheUserCanRecoverFrom)
```

Rules:

- Use tagged errors for expected failures.
- Preserve useful error messages. Do not erase document decode/encode details.
- Catch every expected error tag deliberately with `catchTags` or typed `mapError`.
- Use `orDie` only for truly unrecoverable defects.
- Do not collapse unrelated errors into one vague bucket.
- Prefer services over loose helper functions when behavior touches IO, auth, storage, clients, or backend APIs.
- Verbose error handling is acceptable. That is the point: failures are part of the program.

## 3. UI Scope

At this stage, UI can be simple. Functionality, correctness, and testability matter more than polish.

Still follow Foldkit view discipline:

- Use accessible labels and button names.
- Use `h.submodel` for child models.
- Use `Option.match`, `Array.match`, and tagged state instead of nullable ad hoc branches.
- Render enough state for users to understand what happened.
- Avoid clever UI abstractions until repetition proves they are needed.

Simple does not mean sloppy. A plain working interface with strong tests is better than a pretty untested interface.

## 4. Quality Bar

Do not generate AI filler.

Stop immediately if you are about to add:

- A mock outside a test.
- A fallback that hides a real missing integration.
- A placeholder API key, URL, schema, implementation, or fake backend.
- A hardcoded value that should come from auth, environment, storage, database, or user input.
- A tiny helper whose only job is to obscure one line of logic.
- A broad `catchAll` that destroys error information.
- A type assertion to silence the compiler.
- A raw Convex function when the app should use Confect.

If blocked, say exactly why. It is better to stop with a precise blocker than to ship fake functionality.

Code quality rules:

- Read existing patterns before editing.
- Keep changes scoped.
- Prefer boring explicit code over clever abstractions.
- Name functions by what they do, not by vague categories.
- Remove dead files and empty wrappers.
- Do not refactor unrelated code while implementing a feature.
- Use generated refs and schemas. Never hand-edit generated files.
- Run codegen after Confect spec/table changes.
- Keep model fields as schemas.
- Never use impossible states when a tagged union can represent the real state.

## 5. Submodel Organization

Foldkit submodels are how this scaffold stays organized without React-style state sprawl.

A submodel owns a coherent child workflow:

- Its own `Model`
- Its own `Message`
- Its own `init`
- Its own `update`
- Its own `view`
- Its own commands
- Optional `OutMessage` for parent-level facts

Parent model embeds child model:

```ts
export const Model = S.Struct({
  scheduledTodoForm: ScheduledTodoForm.Model,
})
```

Parent message wraps child message:

```ts
export const GotScheduledTodoFormMessage = m('GotScheduledTodoFormMessage', {
  message: ScheduledTodoForm.Message,
})
```

Parent update delegates and maps commands:

```ts
const [child, commands] = ScheduledTodoForm.update(
  model.scheduledTodoForm,
  message,
)

const mappedCommands = Command.mapMessages(commands, message =>
  GotScheduledTodoFormMessage({ message }),
)
```

Parent view embeds with `h.submodel`:

```ts
h.submodel({
  slotId: 'scheduled-todo-form',
  model: model.scheduledTodoForm,
  view: ScheduledTodoForm.view,
  toParentMessage: message => GotScheduledTodoFormMessage({ message }),
})
```

Use a submodel when a feature has its own inputs, validation, async lifecycle, or repeated internal messages. Do not dump every feature into `main.ts`.

Messages are facts, not commands. Use names like `ClickedDeleteTodo`, `SelectedTodoImage`, `LoadedTodos`, `FailedCreateTodo`. Never use `NoOp`.

## 6. Why This Stack

This stack is built for AI-assisted development with guardrails.

Compared to a typical React app:

- Foldkit `update` is pure and directly testable.
- Commands make side effects explicit and inspectable.
- Scene tests exercise user workflows without browser flakiness.
- Submodels prevent component state from scattering across hooks.
- Confect makes backend functions typed at the spec boundary.
- Effect forces dependencies and errors into the type system.
- `@confect/test` tests Convex behavior without a live backend.
- Typechecking `src` and `confect` catches whole classes of generated-ref, schema, and backend mistakes.

Confect turns backend infrastructure into code. You are not limited to frontend state and HTTP calls. If the feature needs backend capability, provision it explicitly through Confect specs, tables, impls, generated refs, and services.

Convex primitives available through this scaffold include:

- Tables: durable app data with Effect schemas and indexes.
- Indexes: efficient owned lists, lookups, filtered reads, and ordered reads.
- Public queries: reactive client-visible reads.
- Public mutations: transactional writes from the app.
- Public actions: side effects that need the action runtime.
- Internal queries/mutations/actions: private backend-only workflow steps.
- Scheduler: one-off future execution with `Scheduler.runAt` / `runAfter`.
- Cron jobs: static recurring backend jobs.
- Storage: upload URLs, blob deletion, and storage URL lookup.
- Auth: baseline authenticated identity is already wired; derive ownership server-side, never from client args.
- HTTP endpoints: server routes when the app needs an HTTP surface.
- Components: reusable Convex components where appropriate.
- Search/vector search: when the feature needs indexed text or semantic retrieval.
- Environment config: typed configuration through Effect/Confect patterns.

Corresponding Confect docs:

- Project structure: https://confect.dev/concepts/project-structure
- File naming conventions: https://confect.dev/concepts/file-naming-conventions
- Spec/impl model: https://confect.dev/concepts/spec-impl-model
- Services: https://confect.dev/concepts/services
- Schema restrictions: https://confect.dev/concepts/schema-restrictions
- Database schema: https://confect.dev/server/database/schema
- Database reading: https://confect.dev/server/database/reading
- Database writing: https://confect.dev/server/database/writing
- Database determinism: https://confect.dev/server/database/determinism
- System tables: https://confect.dev/server/database/system-tables
- Functions: https://confect.dev/server/functions
- Error handling: https://confect.dev/server/error-handling
- Authentication: https://confect.dev/server/authentication
- Storage: https://confect.dev/server/storage
- Scheduling: https://confect.dev/server/scheduling
- Cron jobs: https://confect.dev/server/cron-jobs
- HTTP API: https://confect.dev/server/http-api
- Node actions: https://confect.dev/server/node-actions
- Plain Convex functions: https://confect.dev/server/plain-convex-functions
- Components: https://confect.dev/server/components
- Search: https://confect.dev/server/search
- Environment variables: https://confect.dev/server/environment-variables
- JS WebSocket client: https://confect.dev/clients/js/websocket
- JS HTTP client: https://confect.dev/clients/js/http
- React client: https://confect.dev/clients/react
- Testing: https://confect.dev/guides/testing

The baseline auth matters. New user-owned features should usually derive the owner from the authenticated identity in the Confect function, index by owner, test unauthenticated failure, test ownership isolation, and test cross-session persistence. Do not accept `userId` from the client for authorization.

The sky is the limit, but every new primitive must be introduced as real infrastructure, not implied magic. Add the spec, add the table/index/storage/scheduler/API surface, run codegen, write Confect tests, then wire the client.

The goal is not “move fast and patch later.” The goal is high-powered TDD: write the contract, watch it fail, implement the smallest real behavior, then prove it across update, view, command, backend, and type layers.

Build like this:

1. Read existing code and docs.
2. Write failing tests.
3. Implement with Confect, Foldkit, and Effect patterns.
4. Run codegen when specs/tables change.
5. Run typecheck early.
6. Run focused tests.
7. Run full tests and lint.
8. Report exactly what works, what is tested, and any honest limitations.

No placeholders. No hidden mocks. No vague errors. No untyped backend drift. This scaffold is for building real software with extreme feedback loops.
