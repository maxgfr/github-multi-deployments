# GitHub Multi Deployments [![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-multi-deployments) [![pipeline](https://img.shields.io/github/workflow/status/maxgfr/github-multi-deployments/build-test)](https://github.com/maxgfr/github-multi-deployments/actions/workflows/test-build.yml)

`maxgfr/github-multi-deployments` is a [GitHub Action](https://github.com/features/actions) which enables you to deploy multiple environments in a single workflow.

This action is a fork of [`bobheadxi/deployments`](https://github.com/marketplace/actions/github-deployments). Thus, before dig into this action, you may check [bobheadxi documentation](https://github.com/bobheadxi/deployments).

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
          token: ${{ secrets.GH_PAT_TOKEN }} # You muse use a personal access token with repo scope enabled
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
step|string|yes|Key of the step to execute. Possible values are `start`, `deactivate-env`, `delete-env`, `finish`.
desc|string|no|Description to set in status.
ref|string|no|The git ref to use for the deploy, defaults to `GITHUB_REF` or `GITHUB_HEAD_REF`
repository|string|no|Set status for a different repository, using the format `$owner/$repository` (optional, defaults to the current repository)
env|string[] or string|no|Name of deployment(s) environment for Github. (Required for `start`, `deactivate-env` and `delete-env`)
deployment_id|string[] or string|no|Deployment(s) id(s) to update (if specified during `start`, the deployment will be updated instead of a new one created)
env_url|string[] or string|no|Environment(s) url (For `finish` only)
status|string|no|Status of the deployment (For `finish` only)
debug|boolean|no|Debug mode
