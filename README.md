# GitHub Multi Deployments

[![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-multi-deployments) [![Build](https://github.com/maxgfr/github-multi-deployments/actions/workflows/test-build.yml/badge.svg)](https://github.com/maxgfr/github-multi-deployments/actions/workflows/test-build.yml) [![Action Test](https://github.com/maxgfr/github-multi-deployments/actions/workflows/test-action.yml/badge.svg)](https://github.com/maxgfr/github-multi-deployments/actions/workflows/test-action.yml)

`maxgfr/github-multi-deployments` is a [GitHub Action](https://github.com/features/actions) which enables you to deploy multiple environments in a single workflow.

This action is a fork of [`bobheadxi/deployments`](https://github.com/marketplace/actions/github-deployments) rewritten in TypeScript with the following improvements:

- Multi-environment support (deploy to N environments in one step)
- Pagination for environments with many deployments
- Retry with exponential backoff on API failures
- Dry-run mode for testing workflows
- Configurable transient/production environment flags
- Custom log URLs, payload metadata, and env URL validation
- Partial failure handling with `continue_on_error`
- GitHub Actions job summaries

## Usage

### Deploy to multiple environments

```yml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        run: ./deploy.sh

      - name: Start deployment
        uses: maxgfr/github-multi-deployments@main
        id: deployment
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          env: '["staging", "production"]'
          desc: Deploying v1.2.3

      - name: Finish deployment
        uses: maxgfr/github-multi-deployments@main
        with:
          step: finish
          token: ${{ secrets.GITHUB_TOKEN }}
          status: success
          deployment_id: ${{ steps.deployment.outputs.deployment_id }}
          env_url: '["https://staging.example.com", "https://example.com"]'
```

### PR preview environments

```yml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - name: Start preview
        uses: maxgfr/github-multi-deployments@main
        id: deploy
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          env: pr-${{ github.event.number }}
          auto_inactive: 'true'
          transient_environment: 'true'
          payload: '{"pr": ${{ github.event.number }}}'

      - name: Deploy preview
        run: ./deploy-preview.sh

      - name: Finish preview
        uses: maxgfr/github-multi-deployments@main
        with:
          step: finish
          token: ${{ secrets.GITHUB_TOKEN }}
          status: ${{ job.status }}
          deployment_id: ${{ steps.deploy.outputs.deployment_id }}
          env_url: https://pr-${{ github.event.number }}.preview.example.com
```

### Clean up on PR close

```yml
on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Deactivate preview
        uses: maxgfr/github-multi-deployments@main
        with:
          step: deactivate-env
          token: ${{ secrets.GITHUB_TOKEN }}
          env: pr-${{ github.event.number }}

      - name: Delete preview environment
        uses: maxgfr/github-multi-deployments@main
        with:
          step: delete-env
          token: ${{ secrets.GH_PAT_TOKEN }}
          env: pr-${{ github.event.number }}
```

### Production deployment with safeguards

```yml
- name: Deploy to production
  uses: maxgfr/github-multi-deployments@main
  id: prod
  with:
    step: start
    token: ${{ secrets.GITHUB_TOKEN }}
    env: production
    transient_environment: 'false'
    production_environment: 'true'
    auto_inactive: 'true'
    log_url: https://grafana.example.com/d/deployments
    payload: '{"version": "${{ github.sha }}", "deployer": "${{ github.actor }}"}'
```

## Inputs

**Name**|**Type**|**Required**|**Description**
-----|-----|-----|-----
token|string|yes|GitHub token. Use a PAT with `repo` scope for `delete-env`.
step|string|yes|Step to execute: `start`, `finish`, `deactivate-env`, `delete-env`, `get-env`
desc|string|no|Description to set in the deployment status.
ref|string|no|Git ref for the deploy. Defaults to `GITHUB_HEAD_REF` or `GITHUB_REF`.
repository|string|no|Target a different repository (`owner/repo`). Defaults to the current repository.
env|string or string[]|no|Environment name(s). JSON array `'["a","b"]'` or single string `'a'`. Required for `start`, `deactivate-env`, `delete-env`.
deployment_id|string or string[]|no|Deployment ID(s) to update. Required for `finish`.
env_url|string or string[]|no|Environment URL(s) to set on success. Must be valid HTTP(S) URLs. For `finish` only.
status|string|no|Deployment status: `success`, `failure`, `cancelled`, `error`, `inactive`, `in_progress`, `queued`, `pending`. For `finish` only.
payload|string|no|JSON metadata attached to the deployment. For `start` only.
auto_inactive|boolean|no|Let GitHub auto-deactivate previous deployments (skips manual deactivation). For `start` only. Default: `false`.
log_url|string|no|Custom log URL. Defaults to the commit checks page.
transient_environment|boolean|no|Mark environment as transient. Set `false` for permanent environments like production. Default: `true`.
production_environment|boolean|no|Mark as production deployment. Default: `false`.
continue_on_error|boolean|no|In multi-env mode, continue with successful environments when some fail. Default: `false`.
dry_run|boolean|no|Log what would happen without calling the API. Default: `false`.
debug|boolean|no|Print detailed arguments and API responses. Default: `false`.

## Outputs

**Name**|**Type**|**Step**|**Description**
-----|-----|-----|-----
deployment_id|string|start|JSON array of deployment objects with IDs and environment information
deployment_id|string|finish|JSON array of objects with deployment IDs and final statuses
env|string|start|The original environment input value
env|string|get-env|JSON array of environment names for the specified ref

## Token Permissions

Step|Token|Required Scopes
-----|-----|-----
`start`|`GITHUB_TOKEN`|`deployments: write`
`finish`|`GITHUB_TOKEN`|`deployments: write`
`deactivate-env`|`GITHUB_TOKEN`|`deployments: write`
`delete-env`|**PAT** (Personal Access Token)|`repo` scope
`get-env`|`GITHUB_TOKEN`|`deployments: read`

The `delete-env` step requires a PAT because the GitHub REST API for deleting environments is not available to installation tokens (`GITHUB_TOKEN`).

## Troubleshooting

**Deployment not appearing in GitHub UI?**
Environments only appear in GitHub after at least one deployment status is created. Make sure the `start` step succeeds (check outputs).

**API rate limit exceeded?**
Environments with many historical deployments trigger paginated API calls. Use `auto_inactive: 'true'` to skip listing old deployments and let GitHub handle deactivation.

**`delete-env` fails with 403?**
This step requires a Personal Access Token with `repo` scope. `GITHUB_TOKEN` does not have permission to delete environments.

**Want to test without creating real deployments?**
Use `dry_run: 'true'` to simulate the workflow. All steps will log what they would do without making API calls.

**Partial failure in multi-environment deployment?**
By default, if one environment fails, the entire step fails. Set `continue_on_error: 'true'` to deploy to environments that succeed and get warnings for those that fail.

**How to see detailed API errors?**
Set `debug: 'true'` to print all arguments and API responses.

## License

[MIT License](LICENSE)
