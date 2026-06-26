# Auth Architecture

This scaffold uses Convex Auth for provisioned apps and exposes it to Foldkit
through `AuthService`.

## Template Auth

Fresh clones can run without a GitHub OAuth app or Resend key. When
`VITE_AUTH_MODE=template`, or when `VITE_CONVEX_URL` is absent, the browser app
uses template auth:

- the app starts signed in as `Template user` by default;
- auth state is backed by `KeyValueStore`;
- signing out writes a local signed-out state;
- clicking a sign-in button writes the local signed-in state and returns to
  `/todos`;
- todos and scheduled todos use in-memory template backend layers.

Template auth is for local starter development only. It does not exercise
server authorization. Backend auth and permission tests should continue to use
Confect's test harness with `withIdentity(...)`.

To force template mode:

```bash
VITE_AUTH_MODE=template bun run dev
```

To use real Convex Auth, set `VITE_AUTH_MODE=convex` and configure the Convex
Auth environment described below.

## Frontend

`src/authService.ts` implements the minimal Convex Auth browser flow without
React: GitHub OAuth, Resend magic link, token refresh, sign-out, and the
`fetchToken` callback consumed by Confect's `WebSocketClient.setAuth`.

The public route is `/`. The protected todo route is `/todos`. The UI guard is
only for user experience; real access control happens in the backend.

## Backend

Convex Auth is configured in Confect-owned files:

- `confect/authProvider.ts` creates the Convex Auth provider with GitHub and
  Resend.
- `confect/auth.spec.ts` and `confect/auth.impl.ts` register Convex Auth's
  plain Convex functions so Confect keeps `convex/auth.ts` generated.
- `confect/http.ts` registers Convex Auth HTTP routes.
- `confect/auth.ts` generates `convex/auth.config.ts`.

Todos are scoped in `confect/todos.impl.ts` with Confect's generated `Auth`
service. Every list/create/delete derives the stable Convex Auth user id from
`identity.subject` on the server. The client never supplies ownership data.

## Codegen

Confect owns `convex/schema.ts`. `confect/schema.ts` composes the Confect
tables with Convex Auth's `authTables`, then exports the combined
`convexSchemaDefinition` consumed by generated Convex code. Always run:

```bash
bun run confect:codegen
```

## Required Env

Set provider env vars in Convex before using real sign-in:

- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_RESEND_KEY`
- `JWT_PRIVATE_KEY` / `JWKS` from the Convex Auth setup command

For GitHub OAuth, configure the callback URL as:

```text
<CONVEX_SITE_URL>/api/auth/callback/github
```
