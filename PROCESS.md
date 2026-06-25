# Process

## Start Here: This Is a Foldkit App

You are building a Foldkit application. Do not churn away from Foldkit into React, ad hoc DOM code, local component state, imperative event handlers, or two-way bindings.

Required stack rule: do not churn from the main stack. Use Foldkit, Convex/Confect, and Effect. You are required to build on this scaffold's architecture. When creating a new app from this scaffold, copy the scaffold `.env.local` into the new app first so the Convex runtime is available.

Foldkit is an Elm Architecture framework for TypeScript built on Effect. The application is structured around one-way data flow:

```text
Model
  -> view(Model)
  -> user/external event
  -> Message
  -> update(Model, Message)
  -> [next Model, Commands]
  -> Command results become Messages
```

That means:

- The `Model` is the single source of truth and is defined with Schema types.
- The `view` renders from the `Model` and emits factual `Message` values.
- The `update` function is pure: it receives the current `Model` and a `Message`, then returns the next `Model` plus any `Command<Message>` values.
- Side effects live in Foldkit `Command.define` definitions, never in view handlers or random helper functions.
- Runtime bootstrapping belongs in `src/entry.ts`; pure app definitions belong in `src/main.ts`.
- UI is built with Foldkit's `html<Message>()` factory inside view functions, not React components.
- Child workflows are modeled as Foldkit submodels with their own `Model`, `Message`, `update`, `view`, commands, and optional `OutMessage`.

The normal app shape is:

```text
src/main.ts
  MODEL schemas
  MESSAGE schemas
  INIT
  UPDATE
  COMMAND definitions
  VIEW

src/entry.ts
  Runtime.makeProgram(...)
  Runtime.run(...)

index.html
  references src/entry.ts
```

Use the vendored Foldkit source as the canonical reference when unsure:

- `repos/foldkit/examples/` for runnable app precedents.
- `repos/foldkit/packages/foldkit/src/` for actual framework APIs.
- `repos/foldkit/packages/typing-game/client/src/` and `repos/foldkit/packages/website/src/` for production architecture examples.

If you are given a UI reference, treat it as a visual and interaction target, not as permission to abandon Foldkit. Copy the UI as faithfully as possible using Foldkit views, CSS, and accessible markup. If the reference depends on React-only packages, unavailable icon/component libraries, animation helpers, or other packages that are not installed, do not block or rewrite the architecture around them. Add a clear local placeholder or CSS/Foldkit equivalent, keep the layout and behavior as close as practical, and note the substitution.

This scaffold is for building Foldkit + Confect apps with Effect. Treat it as a high-discipline app factory: tests first, typed effects everywhere, explicit backend contracts, and no fake shortcuts.

## 0. The Outer Loop

Before writing code, understand the app request. Do not jump directly into components.

Start with a short Q&A stage unless the user explicitly says not to ask questions. Ask the few questions that would materially change the architecture, data model, test plan, or UI fidelity. Prefer 3-8 concrete questions, then proceed with stated assumptions if the user wants speed.

Good initial questions:

- What is the exact source of truth for UI fidelity: screenshot, reference app, existing folder, design tokens, or written spec?
- Which workflows must be fully working on day one, and which can be honest placeholders?
- Should auth be real, mocked, or scaffold auth copied as-is from the starter?
- Which data must persist in Confect/Convex, and which can remain derived UI state?
- Which keyboard shortcuts, drag/drop interactions, realtime behaviors, or animations are acceptance criteria?
- What external callback URLs or ports are fixed by auth providers or integrations?
- Are there destructive actions that need confirmations, soft delete, or audit history?
- What minimum test bar does the user expect for this app size?

After the Q&A, write down assumptions before implementation. If the user corrects an assumption later, update the test plan first, then the implementation.

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
- Template cleanup: starter Todo/Auth/Cron Todo names, routes, tests, docs, generated refs, and demo copy that must be removed, renamed, or intentionally retained.

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
9. Remove or rename leftover starter-template artifacts.
10. Run typecheck, focused tests, full tests, lint.
```

Proceed task by task. Do not mark a task complete until its tests pass. If one layer reveals a missing requirement, update the task list and keep moving. Multiple passes are normal.

Use subagents when useful to speed up independent work: one can inspect docs, one can audit tests, one can review backend contracts, one can check UI accessibility. Do not outsource final judgment. The main builder must integrate the result and run the checks.

## 1. Test Driven Development

Write tests before implementation. A feature is not started until its desired behavior is described in executable tests. Do not build the app first and add a thin test layer afterward.

For any non-trivial app, create an explicit test inventory before the first implementation slice. The inventory should name the test files and the behaviors they will cover. A large app should have tens of tests early and may require hundreds over multiple passes. A polished clone or product surface is not adequately tested by a handful of smoke tests.

Use this sequence for each feature slice:

```text
1. State the user workflow and acceptance criteria.
2. Write failing Confect tests for durable backend behavior, auth, ownership, and typed errors.
3. Write failing update/story tests for model transitions and emitted commands.
4. Write failing command/service tests for side effects.
5. Write failing scene tests for visible controls and user workflows.
6. Implement only enough real code to pass those tests.
7. Run focused tests, typecheck, then the full suite.
8. Add regression tests for any bug found during manual use.
```

Never count manual clicking as coverage. Manual exploration is useful for discovery, but every discovered behavior gap should become an automated test unless the current harness truly cannot express it.

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

Confect tests are required for Confect-backed features. A frontend-only test that stubs the backend does not prove the Confect spec, implementation, auth boundary, indexes, generated refs, or document encoding. Add a `TestConfect.ts` harness per feature area and make sure the Vite glob includes Convex generated files, for example:

```ts
export const layer = TestConfect_.layer(
  confectSchema,
  import.meta.glob('../../convex/**/*.?s'),
)
```

Backend tests should cover:

- unauthenticated failure and the typed user-facing error;
- per-user or per-workspace isolation;
- idempotent initialization and seed behavior;
- create, update, archive, restore, delete, and soft-delete semantics;
- derived fields such as issue keys, progress, timestamps, and completion state;
- comments, notifications, activity events, labels, and relationship changes;
- invalid IDs, missing records, permission failures, and edge cases.

Frontend tests should cover:

- every `Message` branch in `update`;
- commands emitted with correct arguments;
- command success and failure mapping back into messages;
- scene-level workflows for create, edit, delete, filter, sort, search, settings, modals, and empty states;
- keyboard shortcuts from the correct event target. If a shortcut is intended to be global, test a document-level key event, not only an input-focused event;
- drag/drop, inline dropdowns, hover-independent actions, confirmation dialogs, and focus/escape behavior;
- responsive or collapsed navigation behavior when it changes rendered functionality;
- animation wiring when animation affects mount/unmount, focus, visibility, or interaction.

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

Minimum app test checklist:

- At least one Confect test file for every backend domain.
- At least one update/story test file for each major Foldkit model or submodel.
- At least one scene test file for each primary page or workflow group.
- Command tests for each external service boundary.
- Regression tests for every bug discovered during development, including runtime framework errors.
- A final report that states test counts by layer, not just "tests pass".

Template cleanup checklist:

- Remove starter Todo, Auth demo, and Cron Todo files that no longer represent the new app.
- Rename surviving scaffold tests from `todo_tests`, `auth_tests`, or `cron_todo_tests` into feature-specific test folders.
- Replace starter routes, visible labels, document titles, empty states, README references, and comments with the new product language.
- Remove unused Confect specs, impls, tables, Convex functions, services, commands, model branches, CSS, and imports from the starter.
- Run codegen after removing or renaming Confect/Convex surfaces, then typecheck generated refs.
- Run `rg -n "todo|Todo|cron todo|scheduled todo|starter|template"` and either remove each hit or document why it intentionally remains.
- Do not report the app as complete while it still exposes starter Todo functionality, starter test names, or starter demo copy unrelated to the requested product.

Expect multiple passes. A serious feature often needs one pass for tests, one for backend contracts, one for frontend wiring, one for typecheck fallout, one for behavior gaps discovered by tests, and one for cleanup. That is not failure. That is the process working. Do not compress this into one fake-perfect generation. Move in verified increments.

Run:

```bash
bun run typecheck
bun run test
bun run lint
```

If a behavior cannot be tested honestly in the current harness, say so clearly. Do not pretend coverage exists. Example: direct Convex storage upload URLs may not be routable through `convex-test`; test the typed Confect mutations and the frontend upload service boundary separately.

Lessons from the first Linear clone build:

- Copy `.env.local` before starting. Missing or mismatched runtime config wastes time and can masquerade as auth or backend failure.
- Keep the fixed callback port when auth depends on it. If a provider expects `5173`, start Vite with `--strictPort` and resolve collisions instead of silently moving ports.
- Do not replace the stack to escape friction. Foldkit, Confect/Convex, and Effect are the point of the scaffold.
- Start with Confect tests, not only UI tests. Backend behavior is where auth, ownership, persistence, generated refs, and typed errors are proven.
- UI reference fidelity is functional work. Inline dropdowns, drag/drop board interactions, global command menu behavior, animations, icon semantics, density, and empty states should have tests or explicit manual verification.
- Foldkit submodel inputs must pass functions only at the top level of `viewInputs`. If a runtime error says a nested handler exists, lift the function to top-level `viewInputs` or pass primitive data. Add a regression test or code comment around the boundary.
- Global keyboard shortcuts must be subscribed at the document level if they are meant to work outside inputs. Test the event target explicitly.
- Animation should be added through Foldkit-compatible data/model wiring. If `Animation.view` cannot receive handler-bearing content through a submodel boundary, mirror its state in parent-rendered markup instead of nesting event handlers in `viewInputs`.
- Raw SVG icons should come from installed packages such as `lucide-static`; do not scrape icon websites. Keep icons semantic and use `currentColor`.
- "Done" means typecheck, focused tests, full tests, lint, build, and an honest coverage summary. Passing visual inspection alone is not done.

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
