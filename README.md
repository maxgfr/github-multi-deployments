# GitHub Multi Deployments 

[![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-multi-deployments) [![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/maxgfr/github-multi-deployments/actions/workflows/test-build.yml)

`maxgfr/github-multi-deployments` is a [GitHub Action](https://github.com/features/actions) which enables you to deploy multiple environments in a single workflow.

This action is a fork of [`bobheadxi/deployments`](https://github.com/marketplace/actions/github-deployments). Thus, before dig into this action, you may check [bobheadxi documentation](https://github.com/bobheadxi/deployments).

## Features

- **Multi-environment deployments**: Deploy to multiple environments in a single workflow run
- **Environment management**: Deactivate or delete environments automatically
- **Environment discovery**: Get all environments for a specific git ref
- **Type-safe**: Built with TypeScript for better reliability
- **Tested**: Comprehensive test suite included

## Usage

### Simple multi-deployment

```yml
on:
  push:
    branches:
    - main
jobs:
  action:
    runs-on: ubuntu-latest
    steps:
      ...
      - name: Notify deployment start
        uses: maxgfr/github-multi-deployments@v1.3.2
        id: deployment
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          desc: 'Deploying environment C and environment D'
          env: '["envC", "envD"]' # you can also use url as environment such as '["https://...."]'
          debug: true
      ...
      - name: Notify deployment finish
        uses: maxgfr/github-multi-deployments@v1.3.2
        with:
          step: finish
          status: 'success'
          token: ${{ secrets.GITHUB_TOKEN }}
          deployment_id: ${{ steps.deployment.outputs.deployment_id }}
          # env_url: '["https://...."]' to bind the environments url to the deployment ids
          debug: true
```

### Simple multi-deployment with environment deactivation

```yml
on:
  push:
    branches:
    - main
jobs:
  action:
    runs-on: ubuntu-latest
    steps:
      ...
      - name: Notify deployment start
        uses: maxgfr/github-multi-deployments@v1.3.2
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          desc: 'Deploying environment A and environment B'
          env: '["envA", "envB"]'
          debug: true
     ...
      - name: Notify deployment deactivation
        uses: maxgfr/github-multi-deployments@v1.3.2
        with:
          step: deactivate-env
          token: ${{ secrets.GITHUB_TOKEN }}
          env: '["envA", "envB"]'
          debug: true
```

### Simple multi-deployment with environment destruction

```yml
on:
  push:
    branches:
    - main
jobs:
  action:
    runs-on: ubuntu-latest
    steps:
      ...
      - name: Notify deployment start
        uses: maxgfr/github-multi-deployments@v1.3.2
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          desc: 'Deploying environment A and environment B'
          env: '["envA", "envB"]'
          debug: true
     ...
      - name: Notify deployment delete
        uses: maxgfr/github-multi-deployments@v1.3.2
        with:
          step: delete-env
          token: ${{ secrets.GH_PAT_TOKEN }} # You must use a personal access token with repo scope enabled
          env: '["envA", "envB"]'
          debug: true
```

### Get environment for a ref

```yml
on:
  push:
    branches:
    - main
jobs:
  action:
    runs-on: ubuntu-latest
    steps:
     ...
      - name: Get a list of environments
        uses: maxgfr/github-multi-deployments@v1.3.2
        id: envs
        with:
          step: get-env
          token: ${{ secrets.GITHUB_TOKEN }}
          # ref: ${{ github.ref }} # You can also use ref to get the environment
          debug: true
```

## Inputs

**Name**|**Type**|**Required**|**Description**
-----|-----|-----|-----
token|string|yes|GitHub token. You must use a personal access token with repo scope enabled if you want to use `delete-env`
step|string|yes|Key of the step to execute. Possible values are `start`, `deactivate-env`, `delete-env`, `finish`, `get-env`.
desc|string|no|Description to set in status.
ref|string|no|The git ref to use for the deploy, defaults to `GITHUB_REF` or `GITHUB_HEAD_REF`
repository|string|no|Set status for a different repository, using the format `$owner/$repository` (optional, defaults to the current repository)
env|string[] or string|no|Name of deployment(s) environment for Github. Can be a JSON array string like `'["env1", "env2"]'` or a single string like `'env1'`. (Required for `start`, `deactivate-env` and `delete-env`)
deployment_id|string[] or string|no|Deployment(s) id(s) to update. Can be a JSON array of deployment objects or a single deployment ID. (Required for `finish`)
env_url|string[] or string|no|Environment(s) url. Can be a JSON array string like `'["https://...", "https://..."]'` or a single URL. (For `finish` only)
status|string|no|Status of the deployment. Valid values: `success`, `failure`, `cancelled`, `error`, `inactive`, `in_progress`, `queued`, `pending`. (For `finish` only)
debug|boolean|no|Enable debug mode for troubleshooting. Set to `'true'` to enable.

## Outputs

**Name**|**Type**|**Step**|**Description**
-----|-----|-----|-----
deployment_id|string|start|JSON array of deployment objects with IDs and environment URLs
env|string|start|The original environment input value
env|string|get-env|JSON array of environment names for the specified ref

## Internal API Documentation

### `collectDeploymentContext()`

Collects and validates deployment context from GitHub Actions environment.

**Returns:** `DeploymentContext`

**Throws:** `Error` if repository format is invalid

**Example:**
```typescript
const context = collectDeploymentContext()
console.log(`targeting ${context.owner}/${context.repo}`)
```

### `run(step, context)`

Main execution function that routes to the appropriate step handler.

**Parameters:**
- `step` (Step): The step to execute (`start`, `finish`, `deactivate-env`, `delete-env`, `get-env`)
- `context` (DeploymentContext): The deployment context

**Returns:** `Promise<void>`

### `deactivateEnvironment(context, environment)`

Deactivates all existing deployments for a given environment by setting their status to 'inactive'.

**Parameters:**
- `context` (DeploymentContext): The deployment context containing GitHub client and repository info
- `environment` (string): The name of the environment to deactivate

**Returns:** `Promise<DeactivateResult>` - Object containing environment name and count of deactivated deployments

**Example:**
```typescript
await deactivateEnvironment(context, 'production')
// Output: "found 3 existing deployments for env production - marking as inactive"
```

### `getEnvByRef(context, ref)`

Gets all unique environments for deployments on a specific git ref.

**Parameters:**
- `context` (DeploymentContext): The deployment context containing GitHub client and repository info
- `ref` (string): The git ref (branch, tag, or commit SHA) to query deployments for

**Returns:** `Promise<string[]>` - Array of unique environment names

**Example:**
```typescript
const environments = await getEnvByRef(context, 'main')
// Returns: ['production', 'staging']
```

### `isValidUrl(str)`

Validates if a string is a properly formatted HTTP/HTTPS URL.

**Parameters:**
- `str` (string): The string to validate

**Returns:** `boolean` - True if the string is a valid HTTP/HTTPS URL

**Example:**
```typescript
isValidUrl('https://example.com')        // true
isValidUrl('http://localhost:3000')      // true
isValidUrl('ftp://example.com')          // false
isValidUrl('not-a-url')                  // false
```

### `parseArrayOrString(input)`

Safely parses a JSON string that may be an array or a single value.

**Parameters:**
- `input` (string): The JSON string to parse

**Returns:** `string[]` - The parsed value as an array

### `parseDeploymentIds(input)`

Safely parses deployment_id input in various formats.

**Parameters:**
- `input` (string): The deployment_id JSON string

**Returns:** `DeploymentData[]` - Array of deployment data objects

**Throws:** `Error` if parsing fails

### `validateStatus(status)`

Validates if a string is a valid deployment status according to GitHub API.

**Parameters:**
- `status` (string): The status to validate

**Returns:** `status is DeploymentStatus` - Type guard for valid deployment statuses

**Valid statuses:** `success`, `failure`, `cancelled`, `error`, `inactive`, `in_progress`, `queued`, `pending`

## Development

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

### Format

```bash
pnpm format
```

### All checks

```bash
pnpm all
```

## License

MIT