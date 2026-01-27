# @awboost/cfnassets

Build asset zip packages for deployment.

## Quick Start

You need an assets config file:

```jsonc
// cfnassets.config.json
{
  "api": {
    "type": "rollup",
    "options": {
      "entrypoint": "./core/lib/api/lambda.js",
      "install": ["source-map-support"],
      "packageFilePath": "package.json",
      "packageInstallImage": "node:16-slim",
      "packageLockPath": "package-lock.json"
    }
  },
  "app-client": {
    "type": "content",
    "options": {
      "source": "apps/client/build"
    }
  }
}
```

The `packageLockPath` option supports npm (`package-lock.json`), yarn (`yarn.lock`), and pnpm (`pnpm-lock.yaml`):

```jsonc
// Example using pnpm
{
  "api": {
    "type": "rollup",
    "options": {
      "entrypoint": "./lib/lambda.js",
      "install": ["source-map-support"],
      "packageFilePath": "package.json",
      "packageLockPath": "pnpm-lock.yaml"
    }
  }
}
```

Then run:

```
cfnassets build --config cfnassets.config.json
```
