# Exhaustive Testing Guide

This app is a Foldkit program. That matters because most of the application is
plain data and pure functions:

- `Model` is the complete application state.
- `Message` is the complete set of facts that can enter the update loop.
- `update(model, message)` is pure and deterministic.
- `view(model)` is pure and deterministic.
- `Command` and `Subscription` values describe side effects, but do not perform
  them until the runtime executes their Effects.
- Services are Effect dependencies, so live infrastructure can be replaced by
  deterministic test layers.

The testing strategy should take advantage of that. Do not start with "what
clicks do I remember to test?" Start with "what is the full state machine?"
Then prove every transition, every visible state, and every side-effect
boundary.

## Testing Goals

The goal is not just to raise a coverage number. The goal is to make the app
hard to break.

A feature is tested when all of these are true:

1. Every legal `Message` has a pure update test.
2. Every meaningful `Model` variant has a rendering test.
3. Every user action that can produce a `Message` has a scene test.
4. Every command has success and failure tests against a mock service layer.
5. Every subscription has success, failure, startup, and replacement behavior
   tested.
6. Every backend function has schema, authorization, happy path, and error path
   tests.
7. Every displayed error has an assertion that the exact user-facing message is
   visible in the UI.
8. Every disabled, loading, empty, failed, and loaded state is explicitly
   checked in the UI.
9. Every route or major view branch has keyboard, pointer, and accessibility
   coverage.
10. Every important interaction is tested for layout stability and absence of
    visible jank.

For this project, "exhaustive" means deriving tests from the finite program
surface: model states, messages, commands, subscriptions, service methods,
routes, forms, and view branches. It does not mean testing every possible string
or every possible database record. It means each behavior class is identified,
named, and proven.

## Test Layers

Use several layers of tests. Each layer answers a different question.

### 1. Model And Update Tests

Use `foldkit/test` `Story.story` tests for `update`.

These tests prove the Elm-style state machine:

- Given a starting `Model`
- When a `Message` is received
- Then the next `Model` is exactly right
- And the emitted `Command` set is exactly right

Update tests should never need a DOM, a browser, Convex, or a network.

For every message in `Message`, write at least one update test. If a message has
branches, write one test per branch.

Example coverage questions:

- Does typing into an input update only the expected field?
- Does submitting a valid form clear the draft and emit the expected command?
- Does submitting an invalid form preserve the draft and emit no command?
- Does a success message clear the error state?
- Does a failure message store the exact display error?
- Does a subscription update replace stale server data?
- Does a delete click clear an old error before emitting the delete command?

The update test suite is the source of truth for state transitions. If a
transition is not in a story test, assume it is unverified.

### 2. View And Scene Tests

Use `foldkit/test` `Scene.scene` tests for UI behavior.

Scene tests prove the rendered UI and the message wiring:

- Given a `Model`
- The correct text, controls, labels, roles, and states are visible
- When the user interacts with the UI
- The expected `Message` is produced
- The update loop emits the expected `Command`
- Resolving that command results in the expected UI change

Scene tests should use accessible locators:

- `Scene.role('button', { name: 'Delete Buy milk' })`
- `Scene.label('New todo')`
- `Scene.role('status')`
- `Scene.text('Could not load todos')`

Prefer roles and labels over CSS selectors. CSS selectors are acceptable for
structural targets like submitting a specific `form`, but they should not be the
primary way users are represented in tests.

Scene tests must include UI changes, not just command emission. For example, a
failed create test should assert that the error text appears in the UI. A loaded
subscription test should assert the list items and count. A delete test should
assert that the command is emitted and, after a later subscription update, the
deleted item is gone.

### 3. Command Tests

Commands are where pure Foldkit code meets Effect services.

Each command should have tests that provide a fake service layer:

- Success path returns the success message.
- Failure path returns the failure message.
- The service method receives the exact arguments from the command.
- The command catches typed service errors and never crashes the app.

For this app, `CreateTodo` and `DeleteTodo` depend on `TodosBackend`. Tests
should not mock Confect internals for these commands. The app owns
`TodosBackend`, so mock `TodosBackend`.

Command tests answer:

- Does `CreateTodo({ text })` call `backend.create(text)`?
- Does success return `CreatedTodo()`?
- Does failure return `FailedCreateTodo({ error })`?
- Does `DeleteTodo({ id })` call `backend.delete(id)`?
- Does success return `DeletedTodo()`?
- Does failure return `FailedDeleteTodo({ error })`?

If a command depends on time, randomness, UUIDs, storage, routing, or HTTP, put
that dependency behind an Effect service or existing Effect module and provide a
deterministic test layer.

### 4. Subscription Tests

Subscriptions represent continuous external input.

A subscription should be tested as a stream boundary:

- Initial stream value produces the expected message.
- Later stream values produce later messages.
- A stream failure produces a failure message.
- Dependency changes restart the stream when intended.
- Dependency stability does not restart the stream when intended.
- Persistent subscriptions stay alive across unrelated model changes.

For Convex-backed data, subscription tests should use a fake `TodosBackend`
whose `todos` stream is deterministic:

- `Stream.make([...])` for a successful load.
- `Stream.make(first, second)` for live updates.
- `Stream.fail(error)` for backend failure.
- A queue-backed stream for tests that need to push values manually.

The UI tests should then prove that subscription messages render correctly:

- Loading state before data arrives.
- Loaded count after data arrives.
- Empty list when the backend returns an empty array.
- Updated list when the backend returns a changed array.
- Failed state and visible error when the backend stream fails.

### 5. Service Tests

Services are the app-owned abstraction around infrastructure.

The live service should have focused integration tests where feasible, but most
application tests should use fake layers. The fake should be at the same
abstraction level as the app depends on.

For this app:

- The app should depend on `TodosBackend`.
- `TodosBackendLive` should depend on Confect's `WebSocketClient`.
- Tests for app behavior should provide `makeTodosBackendTestLayer(...)`.
- Tests for Confect integration should verify `TodosBackendLive` calls the
  expected Confect refs.
- Backend tests should verify the actual Confect/Convex functions.

This keeps the app testable without Convex running, while still leaving room for
integration tests that prove the live stack is wired correctly.

### 6. Backend Tests

Backend behavior must be tested separately from UI behavior.

For each backend function:

- Validate accepted arguments.
- Reject invalid arguments.
- Enforce authorization.
- Enforce ownership or tenant boundaries.
- Prove the happy path mutation/query result.
- Prove expected domain failures.
- Prove idempotency where relevant.
- Prove sort order and pagination behavior where relevant.
- Prove indexes are used for scalable reads.

For Confect-backed functions, the schemas are not optional documentation. They
are executable contracts. Tests should prove that:

- The table schema accepts valid documents.
- The table schema rejects invalid documents.
- Function args match the public API contract.
- Function return schemas match what clients consume.
- The Foldkit model uses downstream schemas from the Confect source of truth
  wherever possible.

## Deriving The Test Universe

The fastest way to miss tests is to brainstorm manually from the UI. Instead,
derive tests mechanically from the program.

### Step 1. List Model Fields

For every field in `Model`, identify its domain.

Example:

- `todos`: empty array, one item, many items, duplicate text, long text
- `newTodoText`: empty, whitespace, valid text, very long text
- `loadState`: `Loading`, `Loaded`, `Failed`
- `maybeError`: none, create error, delete error, load error

Then identify invalid combinations. If invalid combinations are representable,
consider changing the model. Prefer discriminated unions over booleans and
nullable fields so impossible states become impossible.

For every valid combination that changes rendering or behavior, write at least
one test.

### Step 2. List Messages

For every message, write down:

- Who or what emits it?
- Which model fields does it read?
- Which model fields does it change?
- Which commands does it emit?
- Which errors can it clear or create?
- Which UI should change after it is handled?

A message is not fully tested until all branches are covered.

Example for `AddedTodo`:

- Empty draft: model unchanged, no command.
- Whitespace draft: model unchanged, no command.
- Valid draft: trims text, clears draft, clears old error, emits `CreateTodo`.
- Very long draft: either accepted or rejected according to product rules.

### Step 3. List Commands

For every command, write:

- Arguments
- Required services
- Success message
- Failure message
- Recoverable errors
- Non-recoverable defects

Then test:

- Success
- Each typed failure
- Unexpected thrown/caught error if the command intentionally catches all errors
- Argument forwarding

Commands should return messages, not throw into the runtime. A command failure
that can happen in production should become a `Failed*` message.

### Step 4. List Subscriptions

For every subscription, write:

- What external source it listens to
- What model dependencies control it
- What starts it
- What stops it
- What message each event maps to
- What message each failure maps to

Then test:

- Initial event
- Multiple events
- Failure
- Restart behavior
- No-restart behavior if dependencies are equivalent
- UI state after each emitted message

### Step 5. List Views

For every view branch, identify:

- Visible text
- Accessible roles
- Labels
- Buttons and form controls
- Disabled states
- Error regions
- Empty states
- Loading indicators
- Dynamic counts
- Focus behavior
- Responsive layout

Then test every branch using scene tests and, for layout-sensitive areas,
browser-level visual checks.

### Step 6. List User Paths

A user path is a sequence of interactions and external events.

For each feature, enumerate paths from the user's point of view:

- First load succeeds.
- First load fails.
- First load returns empty data.
- First load returns existing data.
- User types and submits a valid item.
- User submits whitespace.
- Create succeeds.
- Create fails.
- User retries after create failure.
- User deletes an item.
- Delete succeeds.
- Delete fails.
- Backend pushes a remote update while the user is typing.
- Backend pushes deletion of an item visible on screen.
- Backend reconnects after failure.

Every path should have at least one test at the right level. Pure paths belong
in story tests. Interaction paths belong in scene tests. Infrastructure paths
belong in service or integration tests.

## UI Exhaustiveness

UI tests must assert visible outcomes. It is not enough to assert that a command
was emitted.

For each UI state, assert:

- Heading exists.
- Primary controls exist and are labeled.
- Status text is correct.
- Empty state appears only when appropriate.
- List items appear with correct text.
- Delete buttons have item-specific accessible names.
- Error message appears exactly when `maybeError` is present.
- Error message disappears when the model clears it.
- Counts match rendered items.
- Form values match model values.
- Disabled or loading indicators match state.

For each user interaction, assert:

- Typing changes the input value.
- Submitting valid input emits the expected command.
- Submitting invalid input emits no command.
- Clicking delete emits the expected command with the correct id.
- Resolving commands produces the expected next state.
- Failure messages produce visible error text.

For every form:

- Empty submit.
- Whitespace submit.
- Valid submit.
- Long input.
- Special characters.
- Keyboard submit.
- Pointer submit.
- Retry after failure.
- Focus after success if the product expects it.

## Error Path Testing

Every error that can reach users needs three tests:

1. The source produces a typed failure message.
2. `update` stores the error in the correct model state.
3. `view` renders the exact user-facing error.

Do this for:

- Load failure
- Create failure
- Delete failure
- Validation failure
- Authorization failure
- Network failure
- Backend schema mismatch
- Unexpected service failure if it is intentionally caught

Use exact text assertions for user-facing errors. Error copy is product
behavior. A test that only checks "some alert exists" is weaker than a test that
checks "Convex unavailable" appears in the error region.

## Jank And Layout Stability

Functional tests prove behavior. They do not automatically prove the UI feels
stable.

For layout-sensitive features, add browser-level tests that verify:

- Text does not overflow buttons, cards, headers, or status areas.
- Error messages do not overlap adjacent controls.
- Loading to loaded transitions do not cause excessive layout shift.
- Empty to populated list transitions keep the form stable.
- Long todo text wraps or truncates intentionally.
- Delete buttons remain visible and reachable.
- Mobile width renders without horizontal scrolling.
- Desktop width uses the intended max width.
- Focus rings are visible and not clipped.
- Hover and active states do not resize controls.

Use screenshots or DOM bounding boxes for these checks. The point is to catch
"technically works but feels broken" regressions.

Suggested viewport matrix:

- 375 x 667 mobile
- 390 x 844 modern mobile
- 768 x 1024 tablet
- 1280 x 800 laptop
- 1440 x 900 desktop

Suggested visual states:

- Loading
- Loaded empty
- Loaded with one item
- Loaded with many items
- Failed load
- Create failure with draft text
- Delete failure with several items
- Very long item text
- Very long error text

For each screenshot state, confirm:

- No incoherent overlap.
- No clipped primary text.
- No unexpected horizontal scroll.
- No invisible focus target.
- No layout shift caused by hover.

## Accessibility Testing

Accessibility is not a separate feature. It is part of the UI contract.

Every scene test should prefer accessible locators. That forces the UI to expose
usable names and roles.

Checklist:

- Page has one clear top-level heading.
- Form inputs have labels.
- Buttons have meaningful names.
- Status text uses an appropriate role.
- Error text is discoverable by assistive technology.
- Keyboard users can reach every control.
- Keyboard submit works.
- Focus indicators are visible.
- Dynamic updates do not strand focus.
- Color is not the only indicator of error or state.

For destructive actions:

- Button name includes the affected item.
- Failure message identifies that deletion failed.
- The UI remains usable after failure.

## Data And Schema Testing

This project should keep schemas downstream of Confect table definitions where
possible. Tests should protect that contract.

For each table:

- Valid minimal document.
- Valid full document.
- Missing required field.
- Wrong field type.
- Extra field behavior if relevant.
- System fields like `_id` and `_creationTime` are present in docs where the
  frontend expects them.

For each function:

- Args schema accepts valid args.
- Args schema rejects invalid args.
- Return schema accepts actual return values.
- Return schema rejects invalid return values in tests if decoding is used.

If a schema bridge or adapter exists, test it heavily. Adapters are high-risk
because they can silently create two sources of truth. Prefer deleting adapters
when Confect and Foldkit can share the same Effect schema directly.

## Service Mocking Strategy

Services should be mocked at the highest app-owned boundary.

Good:

- App commands depend on `TodosBackend`.
- Tests provide `makeTodosBackendTestLayer`.
- The fake controls success, failure, and stream output.

Avoid:

- Mocking global fetch from unrelated tests.
- Mocking Confect internals in pure app tests.
- Running Convex for update tests.
- Making scene tests depend on live network timing.

A fake service should be:

- Small
- Deterministic
- Explicit about failures
- Typed with the same service shape as production
- Easy to customize per test

When a test needs to assert arguments, write the fake so unexpected arguments
return a typed failure. That makes the assertion part of the behavior instead
of hidden mutable test state.

## Backend Integration Strategy

Most tests should run without Convex. Some tests should run with Convex.

Use offline tests for:

- `update`
- `view`
- command-to-service behavior
- subscription message mapping
- form behavior
- error rendering

Use local Convex integration tests for:

- Actual Confect registered functions
- Schema push compatibility
- Database reads and writes
- Authorization rules
- Index behavior
- Realtime subscription behavior

The local Convex integration suite should be slower and smaller than the pure
suite. It proves the boundary. The pure suite proves the product behavior.

## Regression Checklist For Each Feature

When adding or changing a feature, update this checklist.

Model:

- New state is represented in `Model`.
- Impossible states are impossible or documented.
- Every new state variant has a test fixture.

Messages:

- Every new message has an update test.
- Every branch of every message has coverage.
- Message names describe facts, not commands.

Commands:

- Every command has success and failure tests.
- Every command catches expected failures into messages.
- Every command uses services instead of raw globals.

Subscriptions:

- Every stream event maps to a message.
- Every stream failure maps to a message.
- Restart behavior is tested when dependencies exist.

View:

- Every state renders expected text and controls.
- Every interactive control has a scene test.
- Every error is visible in the UI.
- Empty, loading, loaded, and failed states are covered.

Backend:

- Schema change has tests.
- Function args and returns are tested.
- Authorization and ownership are tested.
- Migration risk is covered if data shape changed.

Jank:

- Mobile screenshot checked.
- Desktop screenshot checked.
- Long text checked.
- Error text checked.
- Focus and keyboard behavior checked.

## Applying This To The Todo App

The current todo app has a small state machine, so it should be nearly fully
covered.

Current model states:

- Loading with no todos.
- Loaded with empty todos.
- Loaded with one todo.
- Loaded with many todos.
- Failed with an error.
- Loaded with a create error.
- Loaded with a delete error.
- Any state with draft input.

Current messages:

- `UpdatedNewTodo`
- `AddedTodo`
- `CreatedTodo`
- `FailedCreateTodo`
- `ClickedDeleteTodo`
- `DeletedTodo`
- `FailedDeleteTodo`
- `LoadedTodos`
- `FailedLoadTodos`

Current commands:

- `CreateTodo`
- `DeleteTodo`

Current subscription:

- `todos`, backed by `TodosBackend.todos`

Minimum expected tests:

- Typing updates `newTodoText`.
- Submitting whitespace emits no command.
- Submitting valid text clears the draft and emits `CreateTodo`.
- Create success returns `CreatedTodo`.
- Create failure returns `FailedCreateTodo`.
- Create failure displays the error.
- Loaded todos replace the current list.
- Empty loaded list displays the empty state.
- Existing loaded list displays all todo text.
- Count matches number of todos.
- Delete click emits `DeleteTodo` with the correct id.
- Delete success returns `DeletedTodo`.
- Delete failure returns `FailedDeleteTodo`.
- Delete failure displays the error.
- Load failure sets failed state.
- Load failure displays the error and failed status.
- Long todo text does not break layout.
- Long error text does not overlap controls.
- Mobile layout has no horizontal scroll.

## When A Test Fails

A failing test should be treated as a state machine disagreement.

Ask:

- Is the model wrong?
- Is the message wrong?
- Is update emitting the wrong command?
- Is the command returning the wrong message?
- Is the service boundary too low-level?
- Is the view failing to represent the model?
- Is the test asserting implementation details instead of behavior?

Prefer fixing the model and message design over patching the view around
awkward state. In Foldkit, clear state shape usually leads to clear tests.

## Definition Of Done

A feature is done only when:

- Pure update behavior is covered.
- UI rendering and interaction are covered.
- Commands are tested with mock services.
- Subscriptions are tested with deterministic streams.
- Backend functions are tested where they own behavior.
- Error paths are visible and asserted.
- Accessibility-critical labels and roles are asserted.
- Mobile and desktop layouts have been checked.
- No live service is required for pure app tests.
- The tests explain the behavior clearly enough that future changes can be
  reviewed against them.

This is the advantage of Foldkit's architecture: the app is already decomposed
into testable pieces. The testing job is to enumerate the state machine and then
prove every edge.
