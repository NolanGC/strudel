# Auth Architecture

This scaffold uses Convex Auth for provisioned apps and exposes it to Foldkit
through `AuthService`.

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
