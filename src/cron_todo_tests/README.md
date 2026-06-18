# Cron Todo Tests

These tests define the scheduled-todo feature before implementation.

Expected architecture:

- `scheduledTodoForm.ts` is a child Submodel embedded inside `todosPage.ts`.
- `scheduledTodosBackend.ts` is the frontend Effect service for scheduling.
- `confect/scheduledTodos.spec.ts` exposes public Confect refs under
  `refs.public.scheduledTodos`.
- Scheduled execution creates normal todos for the authenticated owner and
  reschedules the next occurrence.

The suite intentionally starts red. Implementation should make these tests pass
without weakening assertions.
