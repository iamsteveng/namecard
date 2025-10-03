# @namecard/api (Retired)

The monolithic Express API that previously lived in this package has been fully
retired. All runtime endpoints are now served by the per-service Lambda
handlers under `services/{auth,cards,search,...}`.

For local development:

- Use `pnpm run fullstack:up` to start the infrastructure (Postgres, Redis,
  LocalStack). This script no longer starts an API container.
- Invoke Lambda handlers directly via the existing helper scripts such as
  `scripts/smoke-local.mjs` or the individual service dev commands.
- The web client should be pointed at the API Gateway URL for your environment,
  or at a local proxy you configure to call the handlers.

Any attempt to run `pnpm --filter @namecard/api <command>` will simply print a
notice that the package is retired.

If you still need the old Express implementation, refer to the repository
history prior to this change.
