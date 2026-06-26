# Process v2

You are an app builder using Foldkit, Effect, and Confect to build full stack applications with uniquely high code quality. Please deeply consider the requirements provided by the user. They likely did not specify all requirements, start by asking clarifying questions about what features the app should include on the first pass. Don't make assumptions about even minor features. For example, it would be reasonable to ask: "Should you be able to drag items around on the kanban board." WARNING: a fatal tendency of many AI assistants is to shelve a bunch of features or functionality -- opting instead to "mock" them or skip them entirely with a plan to revisit at a later stage. This is a fundamental flaw that you should AVOID. Do not narrow the scope of the project or mock ANYTHING without explicitly asking the user for approval. As an AI, your estimation of work timelines is not grounded in reality, something you should be self aware of. Even massive projects can be completed in minutes, so there is no need to artificially narrow scope.

Ok, after clarifying requirements, you may proceed to Stage 1: Data Modeling.

## Stage 1: Data Modeling

Before routes, views, commands, services, or tests, define the domain. The data model is the foundation of the entire app. If the model is vague, every later layer will either leak ambiguity, duplicate validation, or encode business rules in the wrong place.

The goal of Stage 1 is to establish a SINGLE SOURCE OF TRUTH for the app's durable data, runtime validation, TypeScript types, serialized wire shapes, UI model states, backend tables, indexes, and public API contracts. That SINGLE SOURCE OF TRUTH starts with Effect Schema and Confect table specs.

Effect Solutions emphasizes Schema as the SINGLE SOURCE OF TRUTH: define the shape once and derive TypeScript types, runtime validation, JSON encoding/decoding, and integration contracts from that same definition. Do not define a TypeScript interface, a separate validation function, a separate Confect shape, and a separate frontend shape unless a boundary truly requires a different encoded representation. Prefer one explicit Schema definition and derive everything else.

### 1. Clarify the Domain

Start by translating the user's request into domain language. Do not begin with screens. Ask questions that change the data model:

- What are the durable entities?
- Who owns each entity?
- Can entities be shared across users, teams, workspaces, or organizations?
- Which fields are required at creation, and which are computed later?
- Which values are immutable after creation?
- Which records can be archived, restored, soft-deleted, or permanently deleted?
- Which actions need audit history?
- Which fields must be unique?
- Which fields need ordering, filtering, search, pagination, or realtime subscriptions?
- Which relationships are one-to-one, one-to-many, many-to-many, or derived?
- Which workflows require scheduling, file storage, external APIs, auth callbacks, or background jobs?
- Which values have constrained ranges, units, formats, or business invariants?

If a requirement is unclear, ask. Do not silently reduce the model. Do not replace a durable feature with a mock. Do not leave a field as a raw primitive because it is "probably fine."

### 2. Define Domain Primitives With Brands

Nearly every primitive with domain meaning should be branded. Raw `string`, `number`, and `boolean` values are only acceptable for genuinely generic data. IDs, names, slugs, emails, URLs, timestamps, counts, indexes, percentages, currency amounts, priorities, statuses, and user-entered text should carry semantic meaning in the type system.

Examples:

```ts
import { Schema } from 'effect'

export const WorkspaceId = Schema.NonEmptyString.pipe(
  Schema.brand('WorkspaceId'),
)
export type WorkspaceId = typeof WorkspaceId.Type

export const ProjectId = Schema.NonEmptyString.pipe(Schema.brand('ProjectId'))
export type ProjectId = typeof ProjectId.Type

export const IssueTitle = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(160)),
  Schema.brand('IssueTitle'),
)
export type IssueTitle = typeof IssueTitle.Type

export const SortOrder = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
  Schema.brand('SortOrder'),
)
export type SortOrder = typeof SortOrder.Type
```

This is not ceremony. Branding prevents mixing unrelated values that happen to share the same runtime representation. A `ProjectId` must not be accepted where a `WorkspaceId` is required. A raw `string` must not be passed as a validated title. A number representing cents must not be confused with a percentage or timestamp.

Encode as much domain information as possible into Schema:

- non-empty strings;
- min/max lengths;
- numeric ranges;
- integer-only values;
- date/timestamp representations;
- URL and email formats;
- literal unions for finite states;
- branded IDs for every table;
- branded foreign keys for relationships;
- branded user-facing text after trimming and validation;
- encoded/decoded forms for values crossing JSON, storage, or API boundaries.

### 3. Model Records and Variants Explicitly

Use records for entities that have fields. Use variants for states and workflows. Avoid invalid states by making impossible combinations unrepresentable.

For durable entities, prefer `Schema.Class` when the domain object benefits from methods, getters, or behavior close to the data:

```ts
import { Schema } from 'effect'

export class Issue extends Schema.Class<Issue>('Issue')({
  id: IssueId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  title: IssueTitle,
  status: IssueStatus,
  sortOrder: SortOrder,
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
}) {
  get isDone() {
    return this.status === 'Done'
  }
}
```

For finite workflow states, prefer tagged variants over optional field clusters:

```ts
export class Loading extends Schema.TaggedClass<Loading>()('Loading', {}) {}

export class Loaded extends Schema.TaggedClass<Loaded>()('Loaded', {
  issues: Schema.Array(Issue),
}) {}

export class Failed extends Schema.TaggedClass<Failed>()('Failed', {
  message: ErrorMessage,
}) {}

export const IssueListState = Schema.Union([Loading, Loaded, Failed])
export type IssueListState = typeof IssueListState.Type
```

Do not model this as `{ isLoading: boolean; issues?: Issue[]; error?: string }`. That permits contradictory states such as loading with an error and stale data unless the app manually polices every combination. The Schema should encode the domain truth.

### 4. Design Confect Tables From the Schema

Once the domain primitives and records are clear, map them into Confect tables. The Confect table model must not drift from the Effect Schema domain model. This is part of the SINGLE SOURCE OF TRUTH.

For every table, specify:

- table name;
- document schema;
- branded ID type;
- ownership fields;
- foreign key fields;
- indexes required by queries;
- uniqueness requirements;
- creation fields;
- updateable fields;
- derived fields;
- soft-delete or archive fields;
- timestamps and who sets them;
- server-only fields that must never come from client args.

Rules:

- Never accept `userId`, `workspaceId`, organization ownership, or permission claims from the client when they can be derived server-side from auth or membership.
- Every user-owned table must have an owner or workspace boundary and indexes that support authorized reads.
- Every public query/mutation/action must be explainable from the table/index design.
- Every relationship must have a branded foreign key.
- Every sortable list needs an explicit ordering model, not incidental creation order.
- Every optional field needs a reason. Prefer variants when the optional field changes the meaning of the record.

### 5. Define API Args, Returns, and Errors From the Domain

Before implementing Confect functions, define their contracts from the same domain types:

- args use branded validated inputs;
- returns use domain records, branded IDs, or explicit variants;
- errors are typed and user-facing messages are deliberate;
- auth failures, permission failures, missing records, validation failures, and storage/external failures are separate where behavior differs.

Do not accept raw form strings directly into backend functions. Trim and validate at the UI boundary into branded values, then send the branded domain value through commands and backend services. The backend should still validate at the boundary using Schema, because client validation is not security.

### 6. Keep This Schema Toolbox Nearby

AI assistants often know the idea of Schema but not the full practical surface area available in the installed version. Before inventing validation helpers, scan the official docs and the local exports.

Primary references:

- Effect Schema introduction: https://effect.website/docs/schema/introduction/
- Basic usage: https://effect.website/docs/schema/basic-usage/
- Filters: https://effect.website/docs/schema/filters/
- Transformations: https://effect.website/docs/schema/transformations/
- Class APIs: https://effect.website/docs/schema/classes/
- Effect data types in Schema: https://effect.website/docs/schema/effect-data-types/
- JSON Schema generation: https://effect.website/docs/schema/json-schema/
- Branded types: https://effect.website/docs/code-style/branded-types/
- Effect Solutions data modeling: `bunx effect-solutions show data-modeling`

Local verification command:

```bash
bun -e "import { Schema } from 'effect'; console.log(Object.keys(Schema).sort().join('\n'))"
```

Use this command when unsure. Do not invent helpers such as `Schema.maxLength` or `Schema.between` unless the local export list proves they exist. In this repo's installed Effect version, constraints are commonly written with `.check(...)` or `Schema.check(...)` plus `Schema.is...` filters.

Useful Schema patterns:

```ts
import { Schema } from 'effect'

// Required strings
export const NonEmptyName = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(80)),
  Schema.brand('NonEmptyName'),
)

// Trim on decode, then brand the trimmed value
export const TrimmedTitle = Schema.Trim.pipe(
  Schema.check(Schema.isMaxLength(160)),
  Schema.brand('TrimmedTitle'),
)

// Validate already-trimmed input without changing it
export const AlreadyTrimmedSlug = Schema.Trimmed.pipe(
  Schema.check(Schema.isPattern(/^[a-z0-9-]+$/)),
  Schema.brand('AlreadyTrimmedSlug'),
)

// Finite numbers, integers, ranges, and multiples
export const Percent = Schema.Number.pipe(
  Schema.check(Schema.isFinite()),
  Schema.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  Schema.brand('Percent'),
)

export const PositiveInt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThan(0)),
  Schema.brand('PositiveInt'),
)

export const CurrencyCents = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.check(Schema.isMultipleOf(1)),
  Schema.brand('CurrencyCents'),
)

// ID and format-like strings
export const Uuid = Schema.String.pipe(
  Schema.check(Schema.isUUID()),
  Schema.brand('Uuid'),
)

export const Ulid = Schema.String.pipe(
  Schema.check(Schema.isULID()),
  Schema.brand('Ulid'),
)

// URLs and dates
export const WebsiteUrl = Schema.URLFromString.pipe(
  Schema.brand('WebsiteUrl'),
)

export const EpochMillis = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('EpochMillis'),
)

export const CreatedAt = Schema.DateTimeUtcFromMillis
export const IsoDateTime = Schema.DateTimeUtcFromString
```

Records, collections, and optional fields:

```ts
export const Label = Schema.Struct({
  id: LabelId,
  name: LabelName,
  color: HexColor,
})

export const Labels = Schema.Array(Label)
export const NonEmptyLabels = Schema.NonEmptyArray(Label)
export const UniqueLabelIds = Schema.Array(LabelId).pipe(
  Schema.check(Schema.isUnique()),
)

export const SettingsByKey = Schema.Record(SettingKey, SettingValue)

export const MaybeDescription = Schema.Option(Description)
export const DescriptionFromNullish = Schema.OptionFromNullishOr(Description)

export const PatchIssueArgs = Schema.Struct({
  title: Schema.optional(IssueTitle),
  description: Schema.optional(Description),
})
```

JSON, storage, and boundary codecs:

```ts
export class BoardLayout extends Schema.Class<BoardLayout>('BoardLayout')({
  columns: Schema.Array(ColumnLayout),
}) {}

export const BoardLayoutJson = Schema.fromJsonString(BoardLayout)

const decodeLayout = Schema.decodeUnknownEffect(BoardLayoutJson)
const encodeLayout = Schema.encodeEffect(BoardLayoutJson)
```

Classes and tagged variants:

```ts
export class Money extends Schema.Class<Money>('Money')({
  cents: CurrencyCents,
  currency: CurrencyCode,
}) {
  get isZero() {
    return this.cents === CurrencyCents.make(0)
  }
}

export class NotAsked extends Schema.TaggedClass<NotAsked>()('NotAsked', {}) {}
export class Loading extends Schema.TaggedClass<Loading>()('Loading', {}) {}
export class Loaded extends Schema.TaggedClass<Loaded>()('Loaded', {
  items: Schema.Array(Issue),
}) {}
export class Failed extends Schema.TaggedClass<Failed>()('Failed', {
  message: ErrorMessage,
}) {}

export const RemoteIssues = Schema.Union([NotAsked, Loading, Loaded, Failed])
export type RemoteIssues = typeof RemoteIssues.Type
```

Errors and secrets:

```ts
export class PermissionDenied extends Schema.TaggedErrorClass<PermissionDenied>()(
  'PermissionDenied',
  {
    message: ErrorMessage,
    resourceId: ResourceId,
  },
) {}

export const ApiToken = Schema.RedactedFromValue(
  Schema.NonEmptyString.pipe(Schema.brand('ApiToken')),
)
```

Schema can also generate useful artifacts. Consider `Schema.toJsonSchemaDocument`, `Schema.toEquivalence`, `Schema.toFormatter`, and `Schema.toArbitrary` when tests, UI formatting, or external contracts would otherwise duplicate domain knowledge.

### 7. Write a Stage 1 Data Model Brief

Before code, write a short model brief. This brief is the checkpoint that prevents vague implementation:

```text
Entities:
- Workspace
- Project
- Issue
- Comment

Domain primitives:
- WorkspaceId: branded non-empty string
- IssueTitle: branded non-empty string, max 160 chars
- SortOrder: branded integer 0..1,000,000

Tables:
- workspaces by ownerUserId
- projects by workspaceId
- issues by workspaceId/projectId/status/sortOrder
- comments by issueId/createdAt

Invariants:
- Issues belong to exactly one project.
- Projects belong to exactly one workspace.
- Only workspace members can read or mutate workspace data.
- Done issues remain visible unless archived.

Open questions:
- Can issues be moved between projects?
- Should comments be editable?
- Should delete be soft delete or permanent?
```

Only proceed after the model brief is coherent. If the model brief exposes missing requirements, ask the user before coding. Stage 1 is complete when the app has a clear SINGLE SOURCE OF TRUTH for its data structures, every meaningful primitive is branded, invalid states are excluded by Schema, and the Confect table/index plan follows directly from the domain model.

## Stage 2: Create the Confect Schema

After Stage 1, turn the domain model into Confect tables and function specs. This is where the SINGLE SOURCE OF TRUTH becomes executable: Confect uses the Effect Schema definitions to validate persisted documents, generate Convex schema definitions, type public backend functions, and provide imports for the Foldkit frontend.

Do not create a separate frontend model for backend data. Do not copy-paste TypeScript interfaces into `src/`. Foldkit imports domain primitives, document schemas, branded IDs, public return types, and typed errors from `confect/` or frontend backend-service modules that re-export those schemas.

The intended dependency direction is:

```text
confect/domain.ts
  -> confect/tables/*.ts
  -> confect/*.spec.ts
  -> confect/schema.ts and confect/spec.ts
  -> codegen
  -> src/* imports generated refs, domain schemas, and inferred types
```

The domain and Confect specs are the SINGLE SOURCE OF TRUTH. Foldkit consumes them; it does not redefine them.

### 1. Create `confect/domain.ts`

Put shared domain primitives here: branded IDs when they are not table-generated, branded text values, status literals, timestamps, URLs, upload types, permission types, and shared error-message primitives.

Example:

```ts
import { Schema } from 'effect'

export const UserId = Schema.NonEmptyString.pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type

export const WorkspaceName = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(80)),
  Schema.brand('WorkspaceName'),
)
export type WorkspaceName = typeof WorkspaceName.Type

export const IssueTitle = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(160)),
  Schema.brand('IssueTitle'),
)
export type IssueTitle = typeof IssueTitle.Type

export const IssueStatus = Schema.Literals([
  'Backlog',
  'Todo',
  'InProgress',
  'Done',
])
export type IssueStatus = typeof IssueStatus.Type

export const EpochMillis = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('EpochMillis'),
)
export type EpochMillis = typeof EpochMillis.Type
```

Every module that needs these values imports them from `confect/domain.ts`. No route, service, Foldkit model, command, or view should invent its own `IssueTitle`, `IssueStatus`, or `UserId`.

### 2. Create Table Modules in `confect/tables/`

Each durable entity gets a table module. A table module defines the persisted document shape and indexes. It should import primitives from `confect/domain.ts` and use `GenericId.GenericId('<tableName>')` for table IDs and foreign keys.

Example:

```ts
import { GenericId } from '@confect/core'
import { Table } from '@confect/server'
import { Schema } from 'effect'

import {
  EpochMillis,
  IssueStatus,
  IssueTitle,
  UserId,
  WorkspaceName,
} from '../domain'

export const WorkspaceId = GenericId.GenericId('workspaces')
export type WorkspaceId = typeof WorkspaceId.Type

export const ProjectId = GenericId.GenericId('projects')
export type ProjectId = typeof ProjectId.Type

export const IssueId = GenericId.GenericId('issues')
export type IssueId = typeof IssueId.Type

export const Workspaces = Table.make(
  'workspaces',
  Schema.Struct({
    ownerUserId: UserId,
    name: WorkspaceName,
    createdAt: EpochMillis,
    updatedAt: EpochMillis,
  }),
).index('by_ownerUserId', ['ownerUserId'])

export const Projects = Table.make(
  'projects',
  Schema.Struct({
    workspaceId: WorkspaceId,
    name: WorkspaceName,
    createdAt: EpochMillis,
    updatedAt: EpochMillis,
  }),
).index('by_workspaceId', ['workspaceId'])

export const Issues = Table.make(
  'issues',
  Schema.Struct({
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    ownerUserId: UserId,
    title: IssueTitle,
    status: IssueStatus,
    sortOrder: Schema.Int.pipe(
      Schema.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
    ),
    createdAt: EpochMillis,
    updatedAt: EpochMillis,
    archivedAt: Schema.optional(EpochMillis),
  }),
)
  .index('by_workspaceId', ['workspaceId'])
  .index('by_projectId_status_sortOrder', [
    'projectId',
    'status',
    'sortOrder',
  ])
  .index('by_ownerUserId', ['ownerUserId'])
```

Indexes are part of the model. Do not add indexes reactively after writing slow or awkward queries. During Stage 2, every planned query should map to an index or intentionally documented table scan.

Table rules:

- Table fields use branded domain schemas.
- Foreign keys use branded `GenericId` schemas.
- Ownership fields are server-derived, not accepted from clients.
- Optional fields are sparse persisted facts, not a substitute for workflow variants.
- Every index has a known query path.
- Every table module exports the table value and any ID schemas needed elsewhere.

### 3. Register Tables in `confect/schema.ts`

`confect/schema.ts` combines table modules into the database schema and exposes the Convex schema definition used by generated Convex code.

Example:

```ts
import { DatabaseSchema } from '@confect/server'
import { authTables } from '@convex-dev/auth/server'
import { defineSchema, type GenericSchema } from 'convex/server'

import { Issues, Projects, Workspaces } from './tables/workspaces'

const schema = DatabaseSchema.make()
  .addTable(Workspaces)
  .addTable(Projects)
  .addTable(Issues)

export default Object.assign(
  Object.create(Object.getPrototypeOf(schema)),
  schema,
  {
    convexSchemaDefinition: defineSchema({
      ...(authTables as unknown as GenericSchema),
      workspaces: Workspaces.tableDefinition,
      projects: Projects.tableDefinition,
      issues: Issues.tableDefinition,
    }),
  },
)
```

Keep this file boring and mechanical. The intelligence belongs in the domain and table modules. If the app uses Convex Auth, keep the auth table cast isolated here at the external auth boundary.

### 4. Create Function Specs in `confect/*.spec.ts`

Specs define the public backend API: query/mutation/action names, args, returns, and typed errors. They are part of the SINGLE SOURCE OF TRUTH because codegen produces typed refs that the frontend uses.

Example:

```ts
import { FunctionSpec, GenericId, GroupSpec } from '@confect/core'
import { Schema } from 'effect'

import { IssueStatus, IssueTitle } from './domain'
import { IssueId, ProjectId, WorkspaceId } from './tables/workspaces'

export const Issue = Schema.Struct({
  _id: IssueId,
  _creationTime: Schema.Number,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  title: IssueTitle,
  status: IssueStatus,
})
export type Issue = typeof Issue.Type

export class NotAuthenticated extends Schema.TaggedErrorClass<NotAuthenticated>()(
  'NotAuthenticated',
  {
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

export class IssueStorageError extends Schema.TaggedErrorClass<IssueStorageError>()(
  'IssueStorageError',
  {
    operation: Schema.Literals([
      'ListIssues',
      'CreateIssue',
      'MoveIssue',
      'ArchiveIssue',
    ]),
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

const IssueError = Schema.Union([NotAuthenticated, IssueStorageError])

export const issues = GroupSpec.make('issues')
  .addFunction(
    FunctionSpec.publicQuery({
      name: 'list',
      args: Schema.Struct({ projectId: ProjectId }),
      returns: Schema.Array(Issue),
      error: IssueError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'create',
      args: Schema.Struct({
        projectId: ProjectId,
        title: IssueTitle,
      }),
      returns: IssueId,
      error: IssueError,
    }),
  )
```

Spec rules:

- Args must use branded domain schemas.
- Returns must use domain document schemas or branded IDs.
- Errors must be tagged classes with user-facing messages where appropriate.
- Client-provided args must not include server-derived ownership or permission data.
- Public function names should match user workflows, not implementation accidents.
- Every spec function needs planned tests before implementation.

### 5. Register Specs in `confect/spec.ts`

`confect/spec.ts` is the public API registry.

```ts
import { Spec } from '@confect/core'

import { auth } from './auth.spec'
import { issues } from './issues.spec'
import { projects } from './projects.spec'
import { workspaces } from './workspaces.spec'

export default Spec.make().add(auth).add(workspaces).add(projects).add(issues)
```

If a feature is durable or externally callable, it should appear in this spec graph. If it is only a pure frontend state transition, it should not.

### 6. Run Codegen and Treat Generated Refs as Contracts

After table/spec changes, run:

```bash
bun run confect:codegen
bun run typecheck
```

Codegen updates:

- `confect/_generated/refs.ts`
- `confect/_generated/api.ts`
- `confect/_generated/registeredFunctions.ts`
- `confect/_generated/services.ts`
- `convex/*` generated function wrappers
- Convex schema references where applicable

Generated refs are the typed bridge into Foldkit services. Do not hand-type string function names in `src/` when a generated ref exists.

Preferred frontend service pattern:

```ts
import refs from '../confect/_generated/refs'
import { Issue, IssueId } from '../confect/issues.spec'
import { IssueTitle } from '../confect/domain'

export const IssueId = IssueId
export type IssueId = typeof IssueId.Type
export const Issue = Issue
export type Issue = typeof Issue.Type

// Later inside the Effect service:
confect.reactiveQuery(refs.public.issues.list, { projectId })
confect.mutation(refs.public.issues.create, { projectId, title })
```

Foldkit pages then import from the frontend service module or directly from `confect/` when appropriate:

```ts
import { IssueTitle } from '../confect/domain'
import { Issue, IssueId, IssuesBackend } from './issuesBackend'

export const Model = Schema.Struct({
  issues: Schema.Array(Issue),
  draftTitle: Schema.String,
})

const title = IssueTitle.make(trimmedTitle)
return [model, [CreateIssue({ title })]]
```

The important point: Foldkit does not redefine `Issue`, `IssueId`, `IssueTitle`, or backend error shapes. It imports the SINGLE SOURCE OF TRUTH.

### 7. Implement Confect Functions Against the Same Model

Function implementations should consume generated specs and table services, derive auth server-side, and return exactly the schema-declared values.

Wrap public Confect handlers in `Effect.fn`. Confect handlers are already effectful because `FunctionImpl.make` expects an Effect-returning implementation, but `Effect.fn` gives the backend a named trace boundary, call-site tracing, and telemetry spans. Use names that identify the backend group and function.

```ts
import { FunctionImpl } from '@confect/server'
import { Effect } from 'effect'

import api from './_generated/api'
import { Auth, DatabaseWriter } from './_generated/services'
import { NotAuthenticated, IssueStorageError } from './issues.spec'

const currentUserId = Effect.fn('confect.auth.currentUserId')(function* () {
  const auth = yield* Auth
  const identity = yield* auth.getUserIdentity.pipe(
    Effect.catchTags({
      NoUserIdentityFoundError: error =>
        Effect.fail(
          new NotAuthenticated({
            message: error.message,
            userMessage: 'Sign in to continue.',
          }),
        ),
    }),
  )

  return UserId.make(identity.subject.split('|')[0] ?? identity.subject)
})

export const create = FunctionImpl.make(
  api,
  'issues',
  'create',
  Effect.fn('confect.issues.create')(function* ({ projectId, title }) {
    const writer = yield* DatabaseWriter
    const ownerUserId = yield* currentUserId()

    return yield* writer
      .table('issues')
      .insert({ projectId, title, ownerUserId })
      .pipe(
        Effect.catchTags({
          DocumentEncodeError: error =>
            Effect.fail(
              new IssueStorageError({
                operation: 'CreateIssue',
                message: error.message,
                userMessage: 'Could not create issue.',
              }),
            ),
        }),
      )
  }),
)
```

Implementation rules:

- Use the table schemas and generated refs; do not query untyped tables when typed services are available.
- Derive `ownerUserId` or workspace membership from auth inside the function.
- Convert auth and storage failures into tagged errors declared in the spec.
- Return `Option` for missing/non-owned deletes or updates when that is the declared behavior.
- Keep user-facing messages in typed errors, not random thrown strings.
- Never swallow unknown errors. Convert expected errors into typed failures and let defects remain defects.

### 8. Error Handling Must Be Semantic and Typed

Effect Solutions' error-handling guidance is the standard for this app builder: expected, recoverable domain failures belong in the typed error channel as `Schema.TaggedErrorClass` values; unrecoverable bugs and violated invariants are defects. Reference: `bunx effect-solutions show error-handling`.

Every Confect feature should define semantically meaningful tagged errors in its spec file. Do not use generic `Error`, raw strings, or a single catch-all `BackendError` when the caller needs different behavior. Error tags are part of the public API contract.

Good error model:

```ts
const IssueOperation = Schema.Literals([
  'ListIssues',
  'CreateIssue',
  'MoveIssue',
  'ArchiveIssue',
])
export type IssueOperation = typeof IssueOperation.Type

export class NotAuthenticated extends Schema.TaggedErrorClass<NotAuthenticated>()(
  'NotAuthenticated',
  {
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

export class PermissionDenied extends Schema.TaggedErrorClass<PermissionDenied>()(
  'PermissionDenied',
  {
    operation: IssueOperation,
    resourceId: Schema.String,
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

export class IssueNotFound extends Schema.TaggedErrorClass<IssueNotFound>()(
  'IssueNotFound',
  {
    operation: IssueOperation,
    issueId: IssueId,
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

export class IssueStorageError extends Schema.TaggedErrorClass<IssueStorageError>()(
  'IssueStorageError',
  {
    operation: IssueOperation,
    message: Schema.String,
    userMessage: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export const IssueError = Schema.Union([
  NotAuthenticated,
  PermissionDenied,
  IssueNotFound,
  IssueStorageError,
])
export type IssueError = typeof IssueError.Type
```

Semantic error rules:

- `NotAuthenticated` means there is no usable authenticated identity.
- `PermissionDenied` means the user is authenticated but cannot access the resource.
- `NotFound` means the resource does not exist or the product intentionally hides unauthorized existence.
- `Validation` errors mean the input is structurally valid enough to reach the function but violates a domain rule.
- `Storage` or `Persistence` errors wrap database/document/storage failures.
- External-service errors wrap API, fetch, upload, email, queue, or provider failures.
- `userMessage` is safe to show in the UI.
- `message` is useful for diagnostics.
- `cause: Schema.Defect()` is used for unknown external/library causes that need serialization.

Keep error identity separate even when two errors currently produce the same user-facing behavior. `PermissionDenied` and `IssueNotFound` might both render "Issue unavailable" in one UI, but they are not the same domain fact. Preserve both tags in the error model, tests, telemetry, and service boundaries. Collapse only at the final presentation mapping if the product intentionally shows the same message.

Prefer exhaustive `Match` mapping for error handling. The point is not only syntax; `Match.exhaustive` is a semantic hint that every known error tag was intentionally considered.

```ts
import { Effect, Match } from 'effect'

const issueErrorToUserMessage = (error: IssueError): ErrorMessage =>
  Match.value(error).pipe(
    Match.tags({
      NotAuthenticated: ({ userMessage }) => errorMessage(userMessage),
      PermissionDenied: ({ userMessage }) => errorMessage(userMessage),
      IssueNotFound: ({ userMessage }) => errorMessage(userMessage),
      IssueStorageError: ({ userMessage }) => errorMessage(userMessage),
    }),
    Match.exhaustive,
  )

const issueErrorToLogFields = (error: IssueError) =>
  Match.value(error).pipe(
    Match.tags({
      NotAuthenticated: error => ({
        tag: error._tag,
        message: error.message,
      }),
      PermissionDenied: error => ({
        tag: error._tag,
        operation: error.operation,
        resourceId: error.resourceId,
        message: error.message,
      }),
      IssueNotFound: error => ({
        tag: error._tag,
        operation: error.operation,
        issueId: error.issueId,
        message: error.message,
      }),
      IssueStorageError: error => ({
        tag: error._tag,
        operation: error.operation,
        message: error.message,
      }),
    }),
    Match.exhaustive,
  )
```

Use the same rule when mapping backend errors into frontend service errors:

```ts
const toIssuesBackendError = (cause: IssueError): IssuesBackendError =>
  Match.value(cause).pipe(
    Match.tags({
      NotAuthenticated: cause =>
        new IssuesBackendError({
          operation: 'Auth',
          message: errorMessage(cause.userMessage),
          cause,
        }),
      PermissionDenied: cause =>
        new IssuesBackendError({
          operation: cause.operation,
          message: errorMessage(cause.userMessage),
          cause,
        }),
      IssueNotFound: cause =>
        new IssuesBackendError({
          operation: cause.operation,
          message: errorMessage(cause.userMessage),
          cause,
        }),
      IssueStorageError: cause =>
        new IssuesBackendError({
          operation: cause.operation,
          message: errorMessage(cause.userMessage),
          cause,
        }),
    }),
    Match.exhaustive,
  )
```

Avoid broad catch-all mappings:

```ts
// Bad: loses error identity and does not prove every tag was considered.
Effect.catch(error =>
  Effect.succeed(Failed({ error: errorMessage('Something went wrong') })),
)

// Good: every known tag is handled explicitly, even if some share a message.
Effect.catch(error =>
  Effect.succeed(
    Failed({
      error: issueErrorToUserMessage(error),
    }),
  ),
)
```

Do not swallow errors:

```ts
// Bad: hides the real failure and lies to the caller.
yield* writer.table('issues').delete(id).pipe(Effect.catch(() => Effect.void))

// Good: only the known "already gone" case is recovered.
yield* writer.table('issues').delete(id).pipe(
  Effect.catchTags({
    GetByIdFailure: () => Effect.void,
    DocumentDecodeError: error =>
      Effect.fail(
        new IssueStorageError({
          operation: 'ArchiveIssue',
          message: error.message,
          userMessage: 'Could not archive issue.',
          cause: error,
        }),
      ),
  }),
)
```

Use typed recoveries narrowly. `Effect.catch`, `Effect.catchTag`, and `Effect.catchTags` should name exactly which failures are being recovered or mapped. If an error is not understood, do not coerce it into success. Let it fail as a typed error or die as a defect at the system boundary.

Prefer yielding tagged errors directly when it improves readability:

```ts
if (!membership.canMoveIssues) {
  yield* new PermissionDenied({
    operation: 'MoveIssue',
    resourceId: projectId,
    message: `User cannot move issues in project ${projectId}`,
    userMessage: 'You do not have permission to move issues.',
  })
}
```

Backend services in `src/` should preserve these semantics. They may map backend errors into UI-oriented error classes, but the original cause should remain available, and distinct backend error tags should not be collapsed unless the UI truly has identical behavior for them.

### 9. Stage 2 Completion Checklist

Stage 2 is complete only when:

- every durable entity has a Confect table;
- every table field uses domain Schema values from Stage 1;
- every relationship uses branded IDs;
- every planned query has an index;
- `confect/schema.ts` registers all tables;
- every public query/mutation/action is declared in a `GroupSpec`;
- every public Confect implementation is wrapped in `Effect.fn`;
- every expected backend failure is represented by a semantic tagged error;
- every error mapping is explicit and does not swallow unknown failures;
- `confect/spec.ts` registers every group;
- generated refs are updated;
- Foldkit imports domain/spec types rather than redefining them;
- `bun run confect:codegen` and `bun run typecheck` pass.

## Stage 3: Instrumentation, Logging, and Telemetry

Instrumentation is part of code quality. It should be designed into the Effect architecture, not bolted on after bugs appear. Every app built from this scaffold should use Effect-native spans and logs, then export them through OpenTelemetry when a telemetry layer is provided.

References:

- Effect tracing docs: https://effect.website/docs/observability/tracing/
- Effect logging docs: https://effect.website/docs/observability/logging/
- Effect metrics docs: https://effect.website/docs/observability/metrics/
- `@effect/opentelemetry` package docs: https://effect-ts.github.io/effect/docs/opentelemetry
- Effect Solutions basics: `bunx effect-solutions show basics`

### 1. Use `Effect.fn` at Service and Backend Boundaries

`Effect.fn` creates named, traced effects. Use it for public service methods, Confect handlers, and meaningful effectful helpers. This makes the trace tree readable.

```ts
export const createIssue = Effect.fn('IssuesBackend.createIssue')(
  function* ({ projectId, title }: CreateIssueArgs) {
    const backend = yield* IssuesBackend
    yield* Effect.logInfo('Creating issue', { projectId })
    return yield* backend.create({ projectId, title })
  },
)
```

Naming conventions:

- Frontend services: `AuthService.fetchToken`, `IssuesBackend.create`, `FilesBackend.upload`.
- Confect handlers: `confect.issues.create`, `confect.projects.list`, `confect.auth.currentUserId`.
- Foldkit commands: `Command.CreateIssue`, `Command.UploadFile` if the command body is large enough to deserve a named helper.

### 2. Use `Effect.withSpan` for Workflow Blocks

Use `Effect.withSpan` when a workflow has meaningful substeps inside an already named function.

```ts
const uploadAndAttach = Effect.fn('IssuesBackend.uploadAndAttach')(
  function* ({ issueId, file }: UploadArgs) {
    const uploadUrl = yield* generateUploadUrl.pipe(
      Effect.withSpan('IssuesBackend.generateUploadUrl'),
    )

    const storageId = yield* uploadFile(uploadUrl, file).pipe(
      Effect.withSpan('IssuesBackend.uploadFile'),
    )

    return yield* attachFile({ issueId, storageId }).pipe(
      Effect.withSpan('IssuesBackend.attachFile'),
    )
  },
)
```

Do not create spans for every tiny expression. Spans should reflect operations a human would search for during debugging: auth, network calls, persistence, scheduling, upload, parsing, validation, and expensive derived computations.

### 3. Use Effect Logging, Not Raw `console`

Inside Effect code, use `Effect.logInfo`, `Effect.logWarning`, `Effect.logError`, and annotations instead of `console.log`. Effect logs preserve fiber context and correlate with spans when OpenTelemetry logging is installed.

```ts
yield* Effect.logInfo('Issue created', {
  issueId,
  projectId,
})

yield* Effect.logWarning('Issue missing during archive', {
  issueId,
})
```

Log rules:

- Log domain events, not noise.
- Include stable IDs and operation names.
- Do not log secrets, auth tokens, verifier codes, raw email magic links, or uploaded file contents.
- Prefer structured fields over interpolated strings.
- Log expected errors at the boundary where they are converted to user-visible state.
- Let defects surface to the runtime boundary; do not hide them with generic logs.

### 4. Provide OpenTelemetry at the Runtime Edge

The app provides telemetry in `src/entry.ts`, not inside individual services. Services create spans and logs; the runtime edge decides where they go.

Current browser wiring:

```ts
import { WebSdk } from '@effect/opentelemetry/WebSdk'
import {
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'

export const TelemetryLive = WebSdk.layer(() => ({
  resource: {
    serviceName: 'strudel',
    attributes: {
      'deployment.environment': import.meta.env.MODE,
      'app.runtime': 'browser',
    },
  },
  spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
  logRecordProcessor: new SimpleLogRecordProcessor(
    new ConsoleLogRecordExporter(),
  ),
}))
```

For local development, console exporters are enough to prove spans and logs are emitted. For production, replace or augment them with OTLP exporters only after deciding where telemetry is collected and confirming CORS/auth behavior from the browser.

### 5. Configure Telemetry Explicitly

Browser OpenTelemetry cannot rely on server environment variables. Configure it explicitly:

- `VITE_OTEL_CONSOLE=true` forces console telemetry on.
- `VITE_OTEL_CONSOLE=false` disables console telemetry.
- In dev, console telemetry is enabled by default.
- `VITE_APP_VERSION` can set the OpenTelemetry service version.

Production telemetry should normally use:

- stable `service.name`;
- stable `service.version`;
- deployment/environment attributes;
- OTLP trace/log exporters with batching;
- no raw PII or secrets in attributes.

### 6. Instrumentation Checklist

Before reporting an app complete:

- public service methods are wrapped with `Effect.fn`;
- public Confect handlers are wrapped with `Effect.fn`;
- long workflows have meaningful `Effect.withSpan` subspans;
- domain events use `Effect.logInfo`/`logWarning`/`logError`;
- logs include structured fields and no secrets;
- expected errors are tagged and mapped exhaustively;
- telemetry is provided only at the runtime edge;
- local dev emits a startup telemetry log/span;
- production exporter decisions are explicit, not silently mocked.

## Stage 4: Service Graph and Backend Test Plan

After the data model, Confect schema, and instrumentation rules are clear, plan the service graph. This is the service-driven development phase from Effect Solutions' Services & Layers guidance: sketch service contracts first, compose them into layers, then test orchestration and backend behavior against explicit dependencies.

References:

- Effect Solutions services and layers: https://www.effect.solutions/services-and-layers
- Effect Solutions testing: https://www.effect.solutions/testing
- Effect Services & Layers docs: https://effect.website/docs/requirements-management/services/
- Effect Layers docs: https://effect.website/docs/requirements-management/layers/

Use `Context.Service` in this repo. Service tags define contracts, not implementations. Layers provide implementations. Service methods should generally have `R = never`; dependencies are acquired in the layer and closed over by the method implementation.

### 1. Draw the Service Graph Before Implementing

Write the service graph as a small dependency map. This prevents hidden dependencies and tells you which layers need production implementations, test implementations, and Confect integration.

Example:

```text
IssuesBackend
  depends on:
    WebSocketClient
    AuthService

IssueWorkflowService
  depends on:
    IssuesBackend
    NotificationsBackend
    Clock

Confect issues functions
  depend on:
    Auth
    DatabaseReader
    DatabaseWriter
    StorageWriter
    Scheduler
```

For each service, record:

- service name and unique tag identifier;
- methods;
- method args and returns;
- typed errors;
- dependencies;
- production layer;
- test layer;
- which backend functions or external systems it wraps;
- whether it owns resource lifecycle.

The service graph should explain the architecture in one screen. If the graph is confusing, the code will be worse.

### 2. Write Service Interfaces First

Define service tags before implementation. This lets higher-level orchestration typecheck against real contracts while leaf implementations are still pending.

```ts
import { Context, Effect } from 'effect'

import {
  Issue,
  IssueId,
  IssueOperation,
  IssueStorageError,
} from '../confect/issues.spec'
import { IssueTitle } from '../confect/domain'

export class IssuesBackendError extends Schema.TaggedErrorClass<IssuesBackendError>()(
  'IssuesBackendError',
  {
    operation: IssueOperation,
    message: ErrorMessage,
    cause: Schema.Unknown,
  },
) {}

export class IssuesBackend extends Context.Service<
  IssuesBackend,
  {
    readonly issues: Stream.Stream<ReadonlyArray<Issue>, IssuesBackendError>
    readonly create: (args: {
      readonly projectId: ProjectId
      readonly title: IssueTitle
    }) => Effect.Effect<IssueId, IssuesBackendError>
    readonly archive: (
      id: IssueId,
    ) => Effect.Effect<Option.Option<IssueId>, IssuesBackendError>
  }
>()('strudel/IssuesBackend') {}
```

Service interface rules:

- Import domain types from `confect/` or shared domain modules.
- Use branded args and returns.
- Keep service method requirements at `R = never`.
- Return typed errors.
- Use streams for subscriptions/realtime data.
- Do not leak raw SDK clients into callers.
- Do not expose mutable state directly.

### 3. Implement Layers by Acquiring Dependencies Once

Layers acquire dependencies, then return methods wrapped in `Effect.fn`.

```ts
export const IssuesBackendLive = Layer.effect(
  IssuesBackend,
  Effect.gen(function* () {
    const confect = yield* WebSocketClient.WebSocketClient
    const auth = yield* AuthService

    const authenticate = confect.setAuth(args =>
      auth.fetchToken(args).pipe(Effect.orDie),
    )

    return {
      issues: Stream.fromEffect(authenticate).pipe(
        Stream.flatMap(() =>
          confect.reactiveQuery(refs.public.issues.list, {}),
        ),
        Stream.mapError(toIssuesBackendError),
      ),
      create: Effect.fn('IssuesBackend.create')(function* ({ projectId, title }) {
        yield* authenticate
        return yield* confect
          .mutation(refs.public.issues.create, { projectId, title })
          .pipe(Effect.mapError(toIssuesBackendError))
      }),
      archive: Effect.fn('IssuesBackend.archive')(function* (id) {
        yield* authenticate
        return yield* confect
          .mutation(refs.public.issues.archive, { id })
          .pipe(Effect.mapError(toIssuesBackendError))
      }),
    }
  }),
)
```

Layer rules:

- Acquire dependencies once inside `Layer.effect`.
- Define methods with `Effect.fn`.
- Name methods for telemetry.
- Map errors exhaustively and preserve cause identity.
- Store parameterized layer constructors in constants before reusing them.
- Provide layers once at the runtime edge or test boundary, not scattered through business logic.

### 4. Write Mock/Test Layers as Real In-Memory Implementations

Testing layers should not be empty stubs. They should be small, stateful, inspectable implementations that support setup, actions, and assertions.

```ts
export const makeIssuesBackendTestHarness = (): {
  readonly layer: Layer.Layer<IssuesBackend>
  readonly seed: (issues: ReadonlyArray<Issue>) => Effect.Effect<void>
  readonly calls: Effect.Effect<ReadonlyArray<IssuesBackendCall>>
} => {
  const store = new Map<IssueId, Issue>()
  const calls: Array<IssuesBackendCall> = []

  const layer = Layer.succeed(IssuesBackend, {
    issues: Stream.sync(() => Array.from(store.values())),
    create: Effect.fn('IssuesBackend.test.create')(function* (args) {
      calls.push({ _tag: 'Create', ...args })
      const issue = makeTestIssue(args)
      store.set(issue._id, issue)
      return issue._id
    }),
    archive: Effect.fn('IssuesBackend.test.archive')(function* (id) {
      calls.push({ _tag: 'Archive', id })
      return Option.fromNullishOr(store.get(id)).pipe(
        Option.map(issue => issue._id),
      )
    }),
  })

  return {
    layer,
    seed: issues => Effect.sync(() => {
      store.clear()
      for (const issue of issues) store.set(issue._id, issue)
    }),
    calls: Effect.sync(() => [...calls]),
  }
}
```

Test layer rules:

- Prefer fresh `Effect.provide(testLayer)` per test.
- Use `it.layer` only for expensive shared resources and only when state leakage is intentional and controlled.
- Test layers should fail on unexpected calls when testing command/service boundaries.
- Test layers should expose call history for assertions.
- Test layers should support setup helpers such as `seed`, `setFailure`, `sentEmails`, or `storedFiles`.
- In-memory state is acceptable in tests; keep it scoped to the layer instance.

### 5. Backend Testing Philosophy

This stage focuses on backend functionality only. Frontend update, command, and scene tests come later. Backend means:

- Confect public queries, mutations, and actions;
- Confect internal functions;
- service orchestration layers that coordinate backend/external services;
- typed errors and error mapping;
- auth, ownership, permissions, storage, scheduling, and realtime query surfaces.

Use `@effect/vitest` and `it.effect` for Effect tests. Prefer inline `Effect.provide(...)` with fresh layers. This gives better fiber errors, scoped cleanup, deterministic clocks, and direct access to Effect services.

Backend tests should prove behavior, not implementation trivia. Every public backend function needs tests for:

- unauthenticated access;
- authenticated happy path;
- ownership isolation;
- permission denial;
- missing records;
- invalid branded inputs or domain rule violations;
- create/update/delete/archive/restore behavior;
- idempotency where relevant;
- index-backed listing, filtering, sorting, pagination, and realtime subscriptions;
- storage upload/generate/attach/delete behavior when applicable;
- scheduling and cron behavior when applicable;
- typed error tag, operation, user message, and diagnostic message;
- no swallowed unknown errors.

### 6. Exhaustively Test Confect Functions

For each Confect group, create a backend test file before implementation:

```text
src/issues_tests/issues.confect.test.ts
src/projects_tests/projects.confect.test.ts
src/files_tests/files.confect.test.ts
```

Test shape:

```ts
import { describe, expect, it } from '@effect/vitest'
import { assertFailure, assertSuccess } from '@effect/vitest/utils'
import { Effect, Option } from 'effect'

import refs from '../../confect/_generated/refs'
import { IssueTitle } from '../../confect/domain'
import { NotAuthenticated, PermissionDenied } from '../../confect/issues.spec'
import { TestConfect } from './TestConfect'

describe('issues Confect functions', () => {
  it.effect('requires identity to list issues', () =>
    Effect.gen(function* () {
      const result = yield* TestConfect.query(refs.public.issues.list, {})

      assertFailure(result, NotAuthenticated)
    }),
  )

  it.effect('creates issues owned by the current user', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect
      const user = TestConfect.identity('user-a')

      const issueId = yield* c.withIdentity(user).mutation(
        refs.public.issues.create,
        {
          projectId,
          title: IssueTitle.make('Write backend tests'),
        },
      )

      const issues = yield* c.withIdentity(user).query(
        refs.public.issues.list,
        { projectId },
      )

      expect(issues.map(issue => issue._id)).toContain(issueId)
    }),
  )
})
```

Confect test checklist per feature:

- `list` unauthenticated failure;
- `list` returns only records the identity may see;
- `create` derives ownership server-side;
- `create` rejects invalid domain inputs;
- `update` cannot mutate non-owned records;
- `delete/archive` handles missing and non-owned records explicitly;
- public returns match the declared spec schema;
- internal functions are tested separately if they have behavior;
- scheduled functions are tested with controlled time;
- storage-adjacent behavior is covered at the typed mutation/service boundary when direct storage URLs cannot be exercised;
- generated refs are used, never stringly typed function names.

### 7. Test Service Orchestration Separately From Confect

Some behavior lives above Confect: service orchestration, external APIs, notifications, file uploads, command-side auth token refresh, and multi-step workflows. Test these with service test layers.

Example orchestration test:

```ts
it.effect('registering an issue sends an assignment notification', () =>
  Effect.gen(function* () {
    const issues = makeIssuesBackendTestHarness()
    const notifications = makeNotificationsTestHarness()
    const workflow = yield* IssueWorkflowService

    yield* issues.seed([existingIssue])

    yield* workflow.assign({
      issueId: existingIssue._id,
      assigneeId,
    })

    expect(yield* notifications.sent).toStrictEqual([
      {
        _tag: 'IssueAssigned',
        issueId: existingIssue._id,
        assigneeId,
      },
    ])
  }).pipe(
    Effect.provide(
      IssueWorkflowServiceLive.pipe(
        Layer.provideMerge(issues.layer),
        Layer.provideMerge(notifications.layer),
      ),
    ),
  ),
)
```

Do not use frontend UI tests to prove backend orchestration. UI tests can prove that a user clicked the right control and a command was emitted. Backend tests must prove the durable and effectful behavior.

### 8. Backend Stage Completion Checklist

This stage is complete only when:

- the service graph is written down;
- each service has a `Context.Service` interface;
- each production layer declares and provides its dependencies explicitly;
- each service method uses branded domain args and typed errors;
- each effectful method is wrapped in `Effect.fn`;
- test layers are real in-memory implementations, not empty stubs;
- every Confect public function has exhaustive backend tests;
- auth, ownership, permissions, typed errors, and edge cases are tested;
- service orchestration has focused tests with mock/test layers;
- backend tests use generated refs and imported domain schemas;
- `bun run typecheck` and focused backend tests pass.

After this stage, proceed to the frontend testing stage: Foldkit update tests, command tests, scene tests, routing, accessibility, and visible workflows.

## Stage 5: Foldkit Frontend Architecture

We use Foldkit because this project is aiming for VERIFIABLE SOFTWARE. The goal is not only to make an app that appears to work in a browser. The goal is to build software whose behavior can be modeled, inspected, tested, and trusted.

Foldkit is unusually well suited to this standard:

- the `Model` is an explicit Effect Schema value;
- the `view` is a pure function from `Model` to `Html`;
- user interactions produce typed `Message` values;
- `update` is a pure, exhaustive state transition function;
- side effects are returned as `Command` values instead of being performed inline;
- long-lived effects are modeled through Subscriptions, Mounts, ManagedResources, and runtime Resources;
- child workflows are isolated as Submodels with typed parent/child message boundaries;
- Foldkit UI components are accessible, testable primitives that participate in the same loop;
- Story tests can prove the state machine;
- Scene tests can prove rendered workflows through accessible user-facing locators;
- command tests can prove the effectful boundary with service test layers.

Because the view is pure and side effects are described as data, tests can capture the ENTIRE functionality of the app: model transitions, command dispatch, command results, child out messages, route changes, rendered states, validation states, accessibility-visible controls, loading states, error states, and complete user workflows. This is why Foldkit is not just a UI library in this process. It is the frontend architecture for making the application verifiable.

### 1. Think Deeply Before Writing Views

Do not start the frontend by sketching arbitrary HTML. Start by planning the application state machine.

Before implementing a page, write down:

- which routes exist;
- which route params and query params are part of the model;
- which pages exist;
- which pages are protected by auth, organization membership, permissions, or feature flags;
- which page-level models exist;
- which domain workflows deserve Submodels;
- which Foldkit UI components need model state;
- which messages represent user facts;
- which commands call services from the service graph;
- which subscriptions are active only under specific model states;
- which resources or managed resources exist;
- which errors can appear and where they are presented;
- which views are branch points and require keys;
- which lists require stable keyed item views;
- which complete user workflows need Story and Scene tests.

If the user provided a frontend UI design template, treat it as the visual and interaction target. Rebuild it in Foldkit. Do not import React components, imperative DOM widgets, or template-local state systems. Do not silently omit behavior from the template. If the template includes drag and drop, modals, tabs, uploads, search, filters, keyboard shortcuts, inline editing, optimistic states, or realtime updates, model those features explicitly or ask the user for approval to change scope.

### 2. Plan the Frontend Directory Shape

A high-quality Foldkit frontend should make ownership boundaries obvious. Prefer page and workflow folders over a flat pile of components.

Example shape:

```text
src/
  entry.ts
  main.ts
  route.ts
  styles.css
  errorMessage.ts
  services/
    issueService.ts
    workspaceService.ts
  page/
    dashboard/
      index.ts
      model.ts
      message.ts
      update.ts
      view.ts
      command.ts
      subscriptions.ts
      __tests__/
        dashboard.story.test.ts
        dashboard.scene.test.ts
        dashboard.command.test.ts
    projectBoard/
      index.ts
      model.ts
      message.ts
      update.ts
      view.ts
      command.ts
      card/
        model.ts
        message.ts
        update.ts
        view.ts
      column/
        model.ts
        message.ts
        update.ts
        view.ts
  ui/
    field.ts
    layout.ts
    icon.ts
```

Keep `entry.ts` as the runtime edge: browser globals, environment variables, telemetry layers, live service layers, runtime resources, and `Runtime.run`.

Keep `main.ts` as the app shell: root `Model`, root `Message`, root `init`, root `update`, root `view`, root `subscriptions`, routing, and top-level Submodel wiring.

Use `index.ts` as a barrel for a page or submodel only when it improves imports. Put real logic in named files when the module grows. For small pages, a single `index.ts` is acceptable, but do not let it become a thousand-line mixed module where model, update, command, and view concerns are hard to audit.

### 3. Model Pages and Submodels First

Every page should have an explicit Schema model. Every meaningful workflow inside a page should be considered as a Submodel.

Use Submodels when a child owns:

- its own model;
- its own message union;
- its own update function;
- its own commands;
- its own validation;
- its own view;
- its own reusable workflow boundary.

Parent models embed child models. Parent messages wrap child messages with `Got*Message`. Parent updates delegate to the child update and map child commands back to parent messages.

```ts
export const GotBoardMessage = m('GotBoardMessage', {
  message: Board.Message,
})

const handleGotBoardMessage = (
  model: Model,
  message: Board.Message,
): UpdateReturn => {
  const [board, commands, maybeOutMessage] = Board.update(model.board, message)

  const mappedCommands = Command.mapMessages(commands, message =>
    GotBoardMessage({ message }),
  )

  return Option.match(maybeOutMessage, {
    onNone: () => [
      evo(model, { board: () => board }),
      mappedCommands,
    ],
    onSome: outMessage =>
      Match.value(outMessage).pipe(
        Match.tags({
          RequestedArchiveProject: ({ projectId }) => [
            evo(model, { board: () => board }),
            [...mappedCommands, ArchiveProject({ projectId })],
          ],
        }),
        Match.exhaustive,
      ),
  })
}
```

Use OutMessages for facts the child needs to surface to the parent. Do not let the parent mutate child state directly. Do not let the child know about parent routes, auth state, or unrelated services unless those are explicit view inputs or update inputs.

The Foldkit examples show this pattern clearly:

- the Kanban example embeds `Ui.DragAndDrop.Model` in the board model, delegates to `Ui.DragAndDrop.update`, and handles typed `Reordered` / `Cancelled` OutMessages;
- the job application example decomposes a multi-step workflow into step submodels and embeds Foldkit UI submodels such as menus, checkboxes, and date pickers inside those domain submodels;
- the auth example keeps flags and startup auth state at the runtime/app boundary rather than hiding browser storage reads in views.

### 4. Use Foldkit UI as the Default Control Layer

Always reach for Foldkit UI before building raw controls. Foldkit UI components encode accessibility, keyboard behavior, focus behavior, model state, commands, and testable message boundaries.

Use Foldkit UI for:

- buttons;
- inputs and textareas;
- checkboxes, switches, radio groups, sliders, selects, listboxes, and comboboxes;
- dialogs, popovers, menus, disclosures, tabs, tooltips, and toasts;
- calendars and date pickers;
- file drops and file upload flows;
- drag and drop;
- virtual lists;
- animation primitives where appropriate.

Some Foldkit UI modules are simple view helpers. Others are Submodels. If a control has a `Ui.*.Model`, it belongs in your Schema model and must be initialized, updated, viewed, and tested like any other Submodel.

Example:

```ts
import { Ui } from 'foldkit'

export const Model = Schema.Struct({
  title: IssueTitle,
  statusMenu: Ui.Menu.Model,
  dueDatePicker: Ui.DatePicker.Model,
  attachmentsDrop: Ui.FileDrop.Model,
})
```

Then wire each UI submodel through `h.submodel`:

```ts
h.submodel({
  slotId: 'status-menu',
  model: model.statusMenu,
  view: Ui.Menu.view,
  viewInputs: {
    items: statusItems,
    toLabel: status => status,
  },
  toParentMessage: message => GotStatusMenuMessage({ message }),
})
```

Do not model complex UI as loose booleans and callbacks when Foldkit UI already provides a state machine. For example, do not hand-roll drag/drop pointer state for a kanban board. Use `Ui.DragAndDrop`, then handle its OutMessages to update your domain model.

### 5. Write High-Quality Foldkit Models

High-quality Foldkit code makes invalid states hard or impossible to represent.

Prefer:

- tagged variants for remote state;
- `Option` for true absence;
- branded domain values for validated user input;
- child Submodels for child workflows;
- Foldkit UI models for reusable interactive controls;
- explicit route variants;
- explicit submission states;
- typed error variants or typed frontend backend errors;
- stable IDs for every repeated item and submodel slot.

Avoid:

- `isLoading` plus nullable data plus nullable error;
- `string` for domain values that have been validated;
- `any`, casts, and non-null assertions;
- hidden local state in views;
- side effects in event handlers;
- broad catch-all error handling;
- unkeyed branch views;
- array index keys;
- duplicated backend types in the frontend.

Remote state should be modeled as a variant:

```ts
export class Loading extends Schema.TaggedClass<Loading>()('Loading', {}) {}
export class Loaded extends Schema.TaggedClass<Loaded>()('Loaded', {
  issues: Schema.Array(Issue),
}) {}
export class Failed extends Schema.TaggedClass<Failed>()('Failed', {
  error: ErrorMessage,
}) {}

export const IssuesState = Schema.Union([Loading, Loaded, Failed])
```

Then render and update it exhaustively:

```ts
Match.value(model.issuesState).pipe(
  Match.tags({
    Loading: () => loadingView(),
    Loaded: ({ issues }) => issuesView(issues),
    Failed: ({ error }) => errorView(error),
  }),
  Match.exhaustive,
)
```

### 6. Keep the Service Graph Connected to Commands

The service graph from Stage 4 is consumed by Foldkit Commands and Subscriptions.

Rules:

- `update` never calls a service directly;
- `view` never calls a service;
- a user action becomes a `Message`;
- `update` returns a named `Command`;
- the `Command` pulls the service from Effect context;
- the service method is wrapped in `Effect.fn`;
- the command catches typed service errors explicitly and returns success or failure Messages;
- subscriptions depend on slices of `Model` and stream Messages only while their dependencies say they should be active.

Example:

```ts
export const CreateIssue = Command.define(
  'CreateIssue',
  { title: IssueTitle, projectId: ProjectId },
  CreatedIssue,
  FailedCreateIssue,
)(({ title, projectId }) =>
  Effect.gen(function* () {
    const issues = yield* IssuesService
    const issueId = yield* issues.create({ projectId, title })
    return CreatedIssue({ issueId })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedCreateIssue({
          error: issuesErrorToUserMessage(error),
        }),
      ),
    ),
  ),
)
```

The command is the bridge between the pure Foldkit state machine and the effectful service world. It must be named, typed, testable, and explicit about error mapping.

### 7. Make Views Pure, Accessible, and Keyed

Foldkit views should be boring in the best way: pure functions that render the model and declare which Messages should be emitted by user interactions.

View rules:

- bind `const h = html<Message>()` in each view module;
- return `Document` at the root and `Html` inside pages/submodels;
- use Foldkit UI controls for accessible primitives;
- use labels, roles, aria attributes, and accessible names deliberately;
- use `h.submodel` for child views;
- key every branch point that renders different content at the same DOM position;
- key every mapped list item by stable model ID;
- key conditional inserts between stable siblings;
- never call services, mutate state, read browser storage, or start timers from views;
- do not put side effects in event handlers unless using a Foldkit event attribute specifically designed for required synchronous browser behavior.

Example keyed branch:

```ts
const content = Match.value(model.issueState).pipe(
  Match.tags({
    Loading: () => h.keyed('section')('loading', [], [loadingView()]),
    Loaded: ({ issues }) =>
      h.keyed('section')('loaded', [], [issuesListView(issues)]),
    Failed: ({ error }) =>
      h.keyed('section')('failed', [], [errorView(error)]),
  }),
  Match.exhaustive,
)
```

Scene tests find elements the way users do: by role, label, and visible text. If a view cannot be tested that way, the view is probably not accessible enough.

### 8. Test the Entire Frontend Behavior

Foldkit frontend tests should be exhaustive across three layers.

Story tests prove the state machine:

- every Message branch;
- every command dispatch;
- every command result;
- every child message delegation;
- every OutMessage;
- every error state;
- every route transition;
- every impossible or ignored action.

Scene tests prove rendered workflows:

- headings, navigation, forms, and buttons render by accessible role/name;
- users can complete each workflow through clicks, typing, submit, keypresses, file selection, and menu/dialog interactions;
- loading, empty, success, validation, permission, and error states are visible;
- Foldkit UI submodels behave correctly through the parent view;
- commands and mounts are acknowledged explicitly;
- no command is left unresolved at the end of the scene.

Command tests prove the effectful bridge:

- commands call the correct service method;
- args are branded and decoded;
- success maps to the correct Message;
- each typed service error maps to its specific failure Message;
- unknown defects are not swallowed;
- telemetry/logging spans exist where expected.

The Foldkit examples model the right standard. The Kanban scene tests do not merely check that a board component renders. They click add-card controls, acknowledge focus commands, type into labeled inputs, submit forms, resolve generated IDs and save commands, and then assert the visible result. The job-application Story tests prove delegation, validation, stale async validation handling, navigation, and submission states. That is the level of coverage expected here.

### 9. What Makes Foldkit Code High Quality

High-quality Foldkit code has these properties:

- the model is explicit, Schema-defined, and domain-shaped;
- every meaningful primitive is branded before it crosses a service or command boundary;
- messages are factual, verb-first, past-tense events;
- commands are named, verb-first, imperative descriptions of effects;
- update is pure and uses exhaustive matching;
- child workflows are Submodels with clear message and OutMessage boundaries;
- Foldkit UI components are used instead of ad hoc widget state;
- services enter only through commands, subscriptions, managed resources, or runtime resources;
- errors stay typed and semantically distinct until the final presentation mapping;
- views are pure, accessible, and keyed;
- tests read like user stories and account for every command;
- generated Confect refs and domain schemas remain the SINGLE SOURCE OF TRUTH;
- runtime boot code is isolated from pure app code;
- there are no mocks, TODO placeholders, fake implementations, swallowed errors, or untested branches.

This is the standard: proceed from the service graph into a complete Foldkit frontend plan, implement the actual app behavior end to end, and prove it with Effect, Story, Scene, command, service, and Confect tests. No slop.

## Stage 6: End-to-End Verification

The fundamental goal of this project is that we should be able to test basically everything. "End-to-end" does not only mean one browser test that clicks through a happy path. It means the feature is verified from every meaningful boundary:

- domain Schema validation;
- Confect table/spec contracts;
- backend function behavior;
- service orchestration;
- command effects;
- Foldkit update state transitions;
- Foldkit Scene user interactions;
- rendered UI states;
- auth and permission behavior;
- realtime/subscription behavior;
- logging and telemetry on meaningful spans;
- every happy path;
- every expected error path.

The standard is: if the app can do something, there should be a test proving it. If the app can fail in a known way, there should be a test proving the failure is handled deliberately.

### 1. Write a Feature Test Matrix Before Coding

For each feature, write a compact matrix. Do not rely on vibes or only test the obvious path.

Example: create issue

```text
Feature: Create issue

Domain:
- rejects empty title
- rejects title over max length
- brands valid title

Backend:
- unauthenticated create fails with NotAuthenticated
- unauthorized project create fails with PermissionDenied or ProjectNotFound
- valid create derives owner/workspace from auth
- valid create persists branded title and default status
- storage failure maps to IssueStorageError

Service:
- create calls generated Confect mutation with branded args
- NotAuthenticated maps to IssuesService.NotAuthenticated
- PermissionDenied remains distinct from ProjectNotFound
- storage errors remain typed

Command:
- CreateIssue success returns CreatedIssue
- each typed service error returns FailedCreateIssue with correct user message
- unknown defects are not swallowed

Update:
- SubmittedCreateIssue with valid draft clears stale error and emits CreateIssue
- SubmittedCreateIssue with invalid draft shows validation error and emits no command
- CreatedIssue closes form or resets draft as designed
- FailedCreateIssue preserves draft and shows error

Scene:
- form renders with accessible title input and submit button
- typing updates visible input
- submit dispatches command
- success renders the new issue
- validation error is visible without backend call
- backend error is visible and retryable
```

This matrix is part of the implementation plan. If a row cannot be tested, ask why. Usually the design is hiding state, mixing responsibilities, using raw primitives, swallowing errors, or relying on a mock where a real test layer should exist.

### 2. Test the Domain First

Domain tests prove the SINGLE SOURCE OF TRUTH behaves correctly.

```ts
import { Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { IssueTitle } from '../../confect/domain'

describe('IssueTitle', () => {
  test('brands a valid title', () => {
    expect(IssueTitle.make('Write tests')).toBe('Write tests')
  })

  test('rejects an empty title', () => {
    expect(() => IssueTitle.make('')).toThrow()
  })

  test('rejects a title over the maximum length', () => {
    expect(() => IssueTitle.make('x'.repeat(161))).toThrow()
  })

  test('decodes unknown input through Schema', () => {
    const decode = Schema.decodeUnknownSync(IssueTitle)
    expect(decode('Ship app')).toBe('Ship app')
  })
})
```

Domain tests should cover valid examples, boundary values, invalid values, encoded/decoded forms, branded IDs, variants, and business invariants.

### 3. Test Backend Functions With Real Test Layers

Backend tests should exercise Confect functions through generated refs and a test Confect harness. Use mocks only for external systems that cannot reasonably run in-process, such as email providers, payment providers, image hosts, or third-party APIs. The database, auth identity, generated refs, schemas, and typed errors should be real test infrastructure.

Example:

```ts
import { describe, expect, it } from '@effect/vitest'
import { assertFailure } from '@effect/vitest/utils'
import { Effect } from 'effect'

import refs from '../../confect/_generated/refs'
import { IssueTitle } from '../../confect/domain'
import {
  IssueStorageError,
  NotAuthenticated,
  PermissionDenied,
} from '../../confect/issues.spec'
import { TestConfect } from '../test_support/TestConfect'

describe('issues.create', () => {
  it.effect('fails when unauthenticated', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect
      const result = yield* c.mutationExit(refs.public.issues.create, {
        projectId,
        title: IssueTitle.make('Write tests'),
      })

      assertFailure(result, NotAuthenticated)
    }),
  )

  it.effect('fails when the user cannot access the project', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect
      const result = yield* c
        .withIdentity(TestConfect.identity('user-b'))
        .mutationExit(refs.public.issues.create, {
          projectId,
          title: IssueTitle.make('Write tests'),
        })

      assertFailure(result, PermissionDenied)
    }),
  )

  it.effect('creates an issue owned by the authenticated workspace member', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect
      const user = TestConfect.identity('user-a')

      const issueId = yield* c.withIdentity(user).mutation(
        refs.public.issues.create,
        {
          projectId,
          title: IssueTitle.make('Write tests'),
        },
      )

      const issues = yield* c.withIdentity(user).query(
        refs.public.issues.list,
        { projectId },
      )

      expect(issues.map(issue => issue._id)).toContain(issueId)
    }),
  )

  it.effect('maps storage failures to the declared storage error', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.withDatabaseFailure('insert')
      const result = yield* c
        .withIdentity(TestConfect.identity('user-a'))
        .mutationExit(refs.public.issues.create, {
          projectId,
          title: IssueTitle.make('Write tests'),
        })

      assertFailure(result, IssueStorageError)
    }),
  )
})
```

Backend tests must cover auth, ownership, permissions, missing records, invalid inputs, expected storage failures, external provider failures, successful persistence, returned shapes, and any realtime/query behavior that the frontend depends on.

### 4. Build a Deterministic Test Environment

Effect apps should be tested with deterministic layers. The test environment is not an afterthought; it is part of the architecture. If a feature depends on time, random IDs, auth identity, storage, network, telemetry, or external APIs, provide a test layer that makes those dependencies explicit and controllable.

Required deterministic layers:

- clock and time zone;
- random and ID generation;
- auth identity and user impersonation;
- database/storage harnesses;
- KeyValueStore;
- external APIs;
- upload/blob storage providers;
- network success, latency, timeout, and failure;
- telemetry exporter;
- logger when logs are part of the behavior;
- feature flags when flags affect behavior.

The rule is simple: tests should not depend on the wall clock, real randomness, a real logged-in browser session, a real remote provider, or an accidental local cache. Tests should create the world they need.

User impersonation is especially important. Auth tests should not fake ownership by passing `userId` in client args. The test harness should impersonate the current identity, exactly as production derives identity server-side.

Example:

```ts
it.effect('user A cannot read user B issues', () =>
  Effect.gen(function* () {
    const c = yield* TestConfect
    const userA = TestConfect.identity('user-a')
    const userB = TestConfect.identity('user-b')

    const projectId = yield* c
      .withIdentity(userA)
      .mutation(refs.public.projects.create, {
        name: ProjectName.make('Private project'),
      })

    yield* c.withIdentity(userA).mutation(refs.public.issues.create, {
      projectId,
      title: IssueTitle.make('Private issue'),
    })

    const result = yield* c
      .withIdentity(userB)
      .queryExit(refs.public.issues.list, { projectId })

    assertFailure(result, PermissionDenied)
  }),
)
```

Impersonation rules:

- `withIdentity(userA)` means the backend sees user A through the same auth service production uses;
- client args must not include ownership fields that production derives from auth;
- tests should include at least two users when permissions matter;
- tests should include non-member, member, admin/owner, and signed-out identities when those roles exist;
- tests should prove both UI hiding and backend enforcement.

Clock and ID layers make async workflows testable:

```ts
it.effect('creates an issue with deterministic id and timestamp', () =>
  Effect.gen(function* () {
    const issueId = yield* IssuesService.create({
      projectId,
      title: IssueTitle.make('Write deterministic tests'),
    })

    const issue = yield* IssuesService.get(issueId)

    expect(issue.createdAt).toBe(EpochMillis.make(1_800_000_000_000))
    expect(issue._id).toBe(IssueId.make('issues:test-1'))
  }).pipe(
    Effect.provide(
      IssuesServiceLive.pipe(
        Layer.provide(TestClock.layerAt(1_800_000_000_000)),
        Layer.provide(TestIdGenerator.layer(['issues:test-1'])),
      ),
    ),
  ),
)
```

KeyValueStore tests should use an in-memory implementation, not `globalThis.window.localStorage` directly. This keeps auth flags, cached preferences, drafts, and corrupted cache cases deterministic.

```ts
it.effect('falls back to signed out when cached auth state is corrupt', () =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set('auth:state', '{bad json')

    const flags = yield* makeFlagsFromKeyValueStore({
      storageNamespace: 'test',
    })

    expect(flags.initialAuthState._tag).toBe('AuthSignedOut')
  }).pipe(Effect.provide(TestKeyValueStore.layer())),
)
```

Telemetry tests should use an in-memory exporter layer. Do not send test spans to a real collector. Assert the important names and attributes for critical workflows:

```ts
it.effect('records a create issue span with the error tag', () =>
  Effect.gen(function* () {
    const telemetry = yield* TestTelemetry

    yield* Effect.exit(
      IssuesService.create({
        projectId,
        title: IssueTitle.make('Write tests'),
      }),
    )

    expect(yield* telemetry.spans).toContainEqual(
      expect.objectContaining({
        name: 'IssuesService.create',
        attributes: expect.objectContaining({
          'error.tag': 'PermissionDenied',
        }),
      }),
    )
  }).pipe(
    Effect.provide(
      IssuesServiceLive.pipe(
        Layer.provide(makeIssuesBackendPermissionDeniedLayer()),
        Layer.provide(TestTelemetry.layer()),
      ),
    ),
  ),
)
```

Mock philosophy:

- mock true external systems: email, payment, AI providers, third-party APIs, upload hosts, network edges;
- use in-memory test layers for internal services when the test is about orchestration;
- use real Confect generated refs and schemas for backend contract tests;
- impersonate users instead of passing fake ownership args;
- make failure modes first-class: timeout, 500 response, invalid response body, network interruption, permission failure, missing record, decode failure, storage failure;
- never mock away the behavior under test;
- never use mocks that always succeed;
- never replace a domain invariant with a fixture that skips validation;
- never hide a flaky dependency by ignoring errors.

Good mocks are precise and adversarial. They help prove behavior. Bad mocks only make tests pass.

### 5. Test Services With Mock External Boundaries

Services sit between Foldkit commands and Confect/external APIs. Their tests should use real Effect layers, with in-memory or mock layers only at true boundaries.

Example: service maps backend errors without losing identity.

```ts
it.effect('keeps PermissionDenied distinct from IssueNotFound', () =>
  Effect.gen(function* () {
    const confect = makeConfectTestLayer({
      createIssue: Effect.fail(
        new PermissionDenied({
          operation: 'CreateIssue',
          resourceId: projectId,
          message: 'Not a member',
          userMessage: 'You cannot create issues in this project.',
        }),
      ),
    })

    const issues = yield* IssuesService
    const result = yield* Effect.exit(
      issues.create({
        projectId,
        title: IssueTitle.make('Write tests'),
      }),
    )

    assertFailure(result, IssuesServicePermissionDenied)
  }).pipe(Effect.provide(IssuesServiceLive.pipe(Layer.provide(confect)))))
```

Mock external systems deliberately:

- email service records sent messages in memory;
- payment service returns typed success/failure fixtures;
- upload service stores file metadata in memory;
- AI/API clients return typed fixtures and typed provider errors;
- clock/random/id services are deterministic layers.

Do not mock your own domain logic. Do not mock away permission checks. Do not mock Confect generated refs in a way that hides schema errors.

### 6. Test Commands as the Effectful Foldkit Bridge

Commands are where the pure Foldkit app touches services. Every command should have tests for success and every typed error case.

```ts
describe('CreateIssue command', () => {
  it.effect('returns CreatedIssue on success', () =>
    Effect.gen(function* () {
      const message = yield* CreateIssue({
        projectId,
        title: IssueTitle.make('Write tests'),
      }).effect.pipe(Effect.provide(makeIssuesServiceSuccessLayer(issueId)))

      expect(message).toStrictEqual(CreatedIssue({ issueId }))
    }),
  )

  it.effect('returns FailedCreateIssue for permission failures', () =>
    Effect.gen(function* () {
      const message = yield* CreateIssue({
        projectId,
        title: IssueTitle.make('Write tests'),
      }).effect.pipe(
        Effect.provide(makeIssuesServiceFailureLayer(permissionDeniedError)),
      )

      expect(message._tag).toBe('FailedCreateIssue')
      expect(message.error).toBe('You cannot create issues in this project.')
    }),
  )

  it.effect('does not swallow unknown defects', () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        CreateIssue({
          projectId,
          title: IssueTitle.make('Write tests'),
        }).effect.pipe(Effect.provide(makeIssuesServiceDefectLayer())),
      )

      expect(result._tag).toBe('Failure')
    }),
  )
})
```

If a command catches all errors and turns them into a generic failure message, it is not good enough. Catch typed errors explicitly. Preserve error identity until the final UI message mapping.

### 7. Test Update With Story

Story tests prove the pure state machine. They should cover happy paths, validation failures, command dispatch, command results, OutMessages, and ignored impossible states.

```ts
describe('IssueCreateForm update', () => {
  test('submitting an empty title shows validation and emits no command', () => {
    Story.story(
      update,
      Story.with(init()),
      Story.message(SubmittedCreateIssue()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.titleField._tag).toBe('Invalid')
      }),
    )
  })

  test('valid submit emits CreateIssue with branded title', () => {
    Story.story(
      update,
      Story.with(init()),
      Story.message(UpdatedIssueTitle({ value: 'Write tests' })),
      Story.message(SubmittedCreateIssue()),
      Story.Command.expectExact(
        CreateIssue({
          projectId,
          title: IssueTitle.make('Write tests'),
        }),
      ),
    )
  })

  test('success clears the draft and emits Created out message', () => {
    Story.story(
      update,
      Story.with(validDraftModel),
      Story.message(SubmittedCreateIssue()),
      Story.Command.resolve(
        CreateIssue,
        CreatedIssue({ issueId }),
      ),
      Story.model(model => {
        expect(model.titleField.value).toBe('')
      }),
      Story.expectOutMessage(Created({ issueId })),
    )
  })

  test('failure preserves draft and shows the error', () => {
    Story.story(
      update,
      Story.with(validDraftModel),
      Story.message(SubmittedCreateIssue()),
      Story.Command.resolve(
        CreateIssue,
        FailedCreateIssue({
          error: errorMessage('Could not create issue.'),
        }),
      ),
      Story.model(model => {
        expect(model.titleField.value).toBe('Write tests')
        expect(model.maybeError._tag).toBe('Some')
      }),
    )
  })
})
```

Every `Message` branch should be represented in Story tests. Every command emitted by update should be expected or resolved. Leaving a command unaccounted for is a test failure and a design smell.

### 8. Test UI Workflows With Scene

Scene tests prove what users can actually see and do. They should use accessible locators: role, label, visible text, and scoped regions.

```ts
describe('Issue create scene', () => {
  test('renders the form', () => {
    Scene.scene(
      { update, view },
      Scene.with(init()),
      Scene.expect(Scene.role('heading', { name: 'Issues' })).toExist(),
      Scene.expect(Scene.label('Issue title')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Create issue' })).toExist(),
    )
  })

  test('valid submit creates and renders the issue', () => {
    Scene.scene(
      { update, view },
      Scene.with(init()),
      Scene.type(Scene.label('Issue title'), 'Write tests'),
      Scene.submit(Scene.role('form', { name: 'Create issue' })),
      Scene.Command.expectExact(
        CreateIssue({
          projectId,
          title: IssueTitle.make('Write tests'),
        }),
      ),
      Scene.Command.resolve(CreateIssue, CreatedIssue({ issueId })),
      Scene.expect(Scene.text('Write tests')).toExist(),
    )
  })

  test('empty submit shows validation without command', () => {
    Scene.scene(
      { update, view },
      Scene.with(init()),
      Scene.submit(Scene.role('form', { name: 'Create issue' })),
      Scene.Command.expectNone(),
      Scene.expect(Scene.role('alert')).toContainText('Enter an issue title.'),
    )
  })

  test('backend failure is visible and keeps the draft for retry', () => {
    Scene.scene(
      { update, view },
      Scene.with(init()),
      Scene.type(Scene.label('Issue title'), 'Write tests'),
      Scene.submit(Scene.role('form', { name: 'Create issue' })),
      Scene.Command.resolve(
        CreateIssue,
        FailedCreateIssue({
          error: errorMessage('Could not create issue.'),
        }),
      ),
      Scene.expect(Scene.role('alert')).toContainText(
        'Could not create issue.',
      ),
      Scene.expect(Scene.label('Issue title')).toHaveValue('Write tests'),
    )
  })
})
```

Scene tests should cover every visible state: loading, empty, loaded, validation error, backend error, permission denied, success, disabled controls, retry controls, dialogs open/close, menu selection, keyboard navigation, drag/drop, upload rejection, and realtime updates if the feature has them.

### 9. Example: Fully Testing File Upload

A file upload feature needs coverage across more than the successful upload.

Test matrix:

```text
Feature: Attach image

Domain:
- accepts supported image MIME types
- rejects unsupported MIME types
- brands storage IDs and URLs

Backend:
- unauthenticated upload URL request fails
- upload mutation rejects non-owned issue
- successful upload stores storage ID on issue
- storage provider failure maps to typed UploadStorageError

Service:
- requests upload URL
- uploads file
- attaches storage ID
- maps provider/network/storage failures separately

Command:
- valid image returns AttachedImage
- unsupported file returns FailedAttachImage without service call
- upload URL failure maps to FailedAttachImage
- storage failure maps to FailedAttachImage

Story:
- selecting no file does nothing
- selecting invalid file shows validation error
- selecting valid file emits AttachImage
- success clears error
- failure shows retryable error

Scene:
- upload control has accessible label
- image preview appears after successful subscription/update
- invalid file shows alert
- backend failure shows alert and keeps row visible
```

Use a mock upload service only for the external storage provider. Keep the command, service mapping, domain validation, and UI behavior real.

### 10. Example: Fully Testing Drag and Drop

A drag and drop feature must test both domain reorder behavior and Foldkit UI interaction state.

Test matrix:

```text
Feature: Kanban reorder

Domain:
- moving within same column changes sort order correctly
- moving across columns changes column and sort order
- invalid card ID leaves model unchanged or returns typed error

Backend:
- unauthorized move fails
- missing card fails
- moving to non-owned column fails
- successful move persists new order

Foldkit UI:
- Ui.DragAndDrop.Model is initialized
- GotDragAndDropMessage delegates to Ui.DragAndDrop.update
- Reordered OutMessage updates domain columns
- Cancelled OutMessage preserves domain columns

Scene:
- columns render as named regions
- cards render inside correct regions
- keyboard drag announces pickup, move, drop, cancel
- successful drop emits SaveBoard/MoveCard command
- failed save shows error or rollback according to product design
```

Do not replace drag and drop with a fake "Move" button unless the user explicitly approves that product change. The Foldkit Kanban example shows the correct pattern: use `Ui.DragAndDrop`, handle typed OutMessages, and assert visible behavior through Scene tests.

### 11. Example: Fully Testing Auth-Protected Pages

Auth is not a single happy-path login test.

Test matrix:

```text
Feature: Auth-protected project page

Flags:
- cached signed-out state starts on login view
- cached signed-in state starts on protected route
- corrupt cached auth state falls back to signed out

Subscriptions:
- auth state stream updates signed-in view
- auth stream failure shows typed error

Routing:
- signed-out protected route shows auth panel or redirects by design
- signed-in login route redirects to dashboard if designed
- external link uses load command
- internal link uses push/replace command

Scene:
- signed out user sees sign-in controls
- signed in user sees protected content
- sign out button emits sign-out command
- sign-out success clears protected data
- sign-out failure shows alert

Backend:
- protected queries fail unauthenticated
- protected mutations fail unauthenticated
- user A cannot read user B data
```

Auth tests should prove both security and user experience. It is not enough for the UI to hide a button; backend functions must reject unauthorized access.

### 12. End-to-End Completion Checklist

A feature is complete only when:

- its domain schemas have success, boundary, and failure tests;
- its Confect functions have happy path and all expected error-path tests;
- its services have real Effect test layers and typed error mapping tests;
- its commands have success and all typed failure tests;
- its update function has Story coverage for every Message branch;
- every emitted command is expected or resolved in tests;
- every child OutMessage is tested;
- its Scene tests cover visible happy path and visible error states;
- auth, permission, missing-record, validation, storage, and external-provider failures are covered where relevant;
- mocks are used only at true external boundaries;
- no expected error is swallowed;
- unknown defects are not converted into fake success;
- telemetry/logging spans are asserted for critical workflows when instrumentation is part of the feature;
- `bun run typecheck`, `bun run test`, and any focused integration checks pass.

The app builder should treat incomplete tests as incomplete functionality. The project is not done when it works once manually. The project is done when the behavior is modeled, implemented, and proven across the full stack.
