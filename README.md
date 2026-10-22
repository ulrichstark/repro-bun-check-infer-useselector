# bun check: false TS2322, return type of a context-sensitive callback is inferred as `unknown` when a type parameter default is a spread of a Supabase select result (tsc 7.0.2 infers it)

### What version of Bun is running?

1.4.4-canary.1+963452075 (also reproduces on 1.4.3)

### What platform is your computer?

Darwin 25.6.0 arm64 arm

### What steps can reproduce the bug?

`bun check` infers a callback's return type as `unknown` when that callback's parameter type is an interface whose type parameter defaults to an object spread of a `@supabase/supabase-js` select result. `tsc` 7.0.2 infers `boolean`.

The only dependency is `@supabase/supabase-js`, which is used for its select-query result type. I couldn't reduce it further: hand-written copies of postgrest-js's parser and result types pass in `bun check`, so the trigger seems to be some detail of the real implementation.

`package.json`:

```json
{
  "name": "bun-check-repro",
  "private": true,
  "type": "module",
  "dependencies": {
    "@supabase/supabase-js": "2.118.0"
  },
  "devDependencies": {
    "typescript": "7.0.2"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "Bundler"
  },
  "files": ["repro.ts"]
}
```

`repro.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

interface Database {
  public: {
    Tables: {
      todos: {
        Row: { id: string };
        Insert: { id: string };
        Update: { id?: string };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
  };
}

const query = createClient<Database>("http://localhost", "key").from("todos").select("id");
declare const row: NonNullable<Awaited<typeof query>["data"]>[number];
const spreadRow = { ...row };

interface State<TExtra = typeof spreadRow> {
  isLoading: boolean;
  extra: TExtra;
}

declare function useSelector<TSelected>(selector: (state: State) => TSelected): TSelected;

const isLoading = useSelector((state) => state.isLoading);
export const probe: boolean = isLoading;
```

Run:

```sh
bun install
bun check --no-pretty
```

### What is the expected behavior?

No errors, the same as TypeScript 7.0.2:

```
$ tsc --noEmit --pretty false
(no output, exit code 0)
```

### What do you see instead?

```
$ bun check --no-pretty
repro.ts(30,14): error TS2322: Type 'unknown' is not assignable to type 'boolean'.
Found 1 error in 1 file, checked 1 file
```

`TSelected` is inferred as `unknown`.

### Additional information

Each of these changes makes the error go away, and tsc reports no error in any of them:

| Change | `bun check` |
| --- | --- |
| Use `typeof row` instead of `typeof spreadRow` (no object spread) | passes |
| Write `extra: typeof spreadRow` directly instead of through a type parameter default | passes |
| Use `.select("*")` instead of `.select("id")` (no select-string parsing) | passes |
| Annotate the result: `const isLoading: boolean = useSelector(...)` (contextual return type) | passes |
| Replace the Supabase row with a hand-written `{ id: string }` | passes |

Through further narrowing (exporting postgrest-js internals into a local copy):

- `ProcessSimpleField<Row, "t", F>` fails when `F` comes from postgrest-js's `ParseNonEmbeddedResourceField<"id">`.
- It passes when `F` is the literal `{ type: "field"; name: "id" }`, or that literal passed through postgrest-js's `SimplifyDeep`.
- Both checkers print the parsed field as `{ type: "field"; name: "id"; }`.

So the structure the parser builds the type from seems to matter, not the resolved type.

How I hit this: in a TanStack Start app, `useRouterState({ select: (state) => state.isLoading })` (`@tanstack/react-router` 1.170.45) returns the whole `RouterState` instead of `boolean` under `bun check`. That's 7 false errors in the project, versus 0 with tsc 7.0.2.

`RouterState`'s second type parameter defaults to `MakeRouteMatchUnion`, a union over all routes that includes each route's `loaderData`. One route's loader returns `rows.map((row) => ({ ...row, … }))` over a Supabase `.select("…")` result. Removing just that route from the route tree makes all 7 errors disappear.
