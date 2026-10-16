# mongocli

A MongoDB CLI using the same stack and command parser as sqlcli: Bun, TypeScript,
ES modules, and the official database driver. No separate mongosh installation required.

## Development and installation

```sh
bun install
bun test
bun run tsc
bun run build
bun link
# Local development: bun run src/index.ts --help
```

## Named connections

```sh
# Interactive setup: prompts for URI, database, optional user/auth database,
# then a hidden password when authentication is selected.
mongocli connection add production

mongocli connection add local --uri mongodb://localhost:27017 --database mydb

# With flags, --user prompts for a hidden password:
mongocli connection add production --uri mongodb+srv://cluster.example.net \
  --database mydb --user reader --auth-source admin

# Alternatively, supply a password through stdin:
read -rs -p 'MongoDB password: ' password; echo
printf '%s' "$password" | mongocli connection add production \
  --uri mongodb+srv://cluster.example.net --database mydb \
  --user reader --auth-source admin --password-stdin
unset password

mongocli connection list
mongocli connection list --verbose
```

Configuration lives at `$XDG_CONFIG_HOME/mongocli/config.json`, defaulting to
`~/.config/mongocli/config.json`. Writes are atomic with mode `0600`. Passwords
are stored in **plaintext**, masked when listed, and passed directly to the driver,
not as subprocess arguments. Do not commit the config. URI credentials are rejected;
use separate user/password fields. `connection add --force` replaces a profile.

You can also create the config manually (set permissions to `0600`):

```json
{
  "version": 1,
  "connections": {
    "local": { "uri": "mongodb://localhost:27017", "database": "mydb" },
    "production": {
      "uri": "mongodb+srv://cluster.example.net",
      "database": "mydb",
      "user": "reader",
      "password": "replace-me",
      "authSource": "admin"
    }
  }
}
```

## Queries

```sh
mongocli query -c local 'db.products.find({ active: true }).sort({ name: 1 })'
mongocli query -c local -o json 'db.products.findOne()'
mongocli query -c local -o csv --limit 500 'db.products.find({}, { projection: { name: 1 } })'
mongocli query -c local 'db.collection("products").countDocuments()'
mongocli query -c local 'db.products.findOne({ _id: new ObjectId("000000000000000000000001") })'
echo 'db.listCollections().toArray()' | mongocli query -c local -o json
```

Expressions use **MongoDB Node.js driver APIs**, not the full mongosh language.
`db.products` is shorthand for `db.collection("products")`; use the latter for
collection names conflicting with database methods. `ObjectId` and `EJSON` are
available. Promises are awaited, and returned cursors are materialized with a
100-document default cap (`--limit` overrides it). Smaller FindCursor limits
are preserved. Explicit `.toArray()` calls bypass the CLI cap, as do expressions
returning arrays; apply your own limits in those cases. JSON uses relaxed
Extended JSON; CSV serializes nested objects as JSON.

One JavaScript expression is accepted. For multiple statements use an async IIFE:

```sh
mongocli query -c local '(async () => { const n = await db.products.countDocuments(); return { count: n }; })()'
```

**Only run trusted expressions.** Evaluation is not a security sandbox, and the
CLI does not enforce read-only access. Use database-enforced read-only users for
production. There is no reusable background session or interactive shell yet.

## Testing

`bun test` covers configuration, credential masking, permissions, CLI failures,
expression evaluation, cursor caps, and output formatting without a MongoDB server.
Live connectivity requires your own MongoDB instance.
