# Confect Effect 4 Branch

This project is temporarily using the Confect Effect 4 branch from:

```txt
https://github.com/gunta/confect.git#effect4
commit c4d6485
```

The source checkout used to build the tarballs lives locally at:

```txt
repos/confect-effect4
```

The committed app vendors only the small packed tarballs in:

```txt
vendor/confect-effect4
```

`confect/package.json` points `@confect/core`, `@confect/server`, and
`@confect/cli` at tarballs packed from that branch. The root app also uses
packed `@confect/core` and `@confect/js` tarballs so Foldkit commands and
subscriptions can call Confect refs directly. This avoids raw workspace-package
install issues while keeping the branch pinned locally. This lets the Foldkit
model use the Confect table schema directly:

```ts
const Todo = Todos.Doc
```

That is the desired single source of truth: Confect owns the table schema, and
Foldkit consumes the same Effect schema instead of a translated copy.

## Rebuild Local Confect Packages

If `repos/confect-effect4/packages/*/dist` is missing or stale:

```bash
bun run confect:build-effect4
corepack pnpm@11.0.9 --filter @confect/core --filter @confect/server --filter @confect/cli --filter @confect/js pack --pack-destination repos/confect-effect4/.packs
cp repos/confect-effect4/.packs/confect-*.tgz vendor/confect-effect4/
bun install
bun run confect:install
bun run confect:codegen
```

## Roll Back To Stable Confect

When stable Confect supports the same Effect runtime as Foldkit, replace the
local `file:` dependencies in `confect/package.json` with stable npm versions,
then run:

```bash
bun run confect:install
bun run confect:codegen
bun run typecheck
```

If stable Confect is still on a different major Effect runtime, direct
`Todos.Doc` embedding is not safe. Either keep this branch pinned or restore the
old compatibility adapter until both packages share the same Effect version.
