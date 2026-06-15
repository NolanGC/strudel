# Auth Tests

This folder mirrors the todo test structure for the auth feature:

- `auth.update.story.test.ts` covers the pure Foldkit state transitions.
- `auth.scene.test.ts` covers the rendered sign-in and sign-out user paths.
- `auth.command.test.ts` covers command execution against a mocked
  `AuthService` layer.

The app depends on `AuthService`, not on a provider SDK. That keeps auth tests
small and lets generated apps swap local mock auth, Convex Auth, Clerk, or a
custom provider without rewriting the Foldkit model tests.
