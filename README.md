# GitHub Multi Deployments [![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-multi-deployments) [![pipeline](https://img.shields.io/github/workflow/status/maxgfr/multi-deployments/build-test)](https://github.com/maxgfr/multi-deployments/actions/workflows/build.yaml)

`maxgfr/multi-deployments` is a [GitHub Action](https://github.com/features/actions) which enables you to deploy multiple environments in a single workflow.

:warning: This action is based on based on [`bobheadxi/deployments`](https://github.com/marketplace/actions/github-deployments). Thus, before dig into this action, you may check [bobheadxi documentation](https://github.com/bobheadxi/deployments).

## Usage

```yml
on:
  push:
    branches:
    - main

jobs:
  action:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Sleep for 10 seconds
        uses: jakejarvis/wait-action@master
        with:
          time: '10s'
      - name: Notify deployment start
        uses: maxgfr/multi-deployments@main
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          description: 'Deploying environment A and environment B'
          env: '["envA", "envB"]'
          debug: true
      - name: Sleep for 10 seconds
        uses: jakejarvis/wait-action@master
        with:
          time: '10s'
      - name: Notify deployment deactivation
        uses: maxgfr/multi-deployments@main
        with:
          step: deactivate-env
          token: ${{ secrets.GITHUB_TOKEN }}
          env: '["envA", "envB"]'
          debug: true
      - name: Sleep for 10 seconds
        uses: jakejarvis/wait-action@master
        with:
          time: '10s'
      - name: Notify deployment delete
        uses: maxgfr/multi-deployments@main
        with:
          step: delete-env
          token: ${{ secrets.GH_PAT_TOKEN }} # You muse use a personal access token with repo scope enabled
          env: '["envA", "envB"]'
          debug: true
      - name: Sleep for 10 seconds
        uses: jakejarvis/wait-action@master
        with:
          time: '10s'
      - name: Notify deployment start
        uses: maxgfr/multi-deployments@main
        id: deployment2
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          description: 'Deploying environment C and environment D'
          env: '["envC", "envD"]'  # you can also use url as environment such as '["https://...."]'
          debug: true
      - name: Sleep for 10 seconds
        uses: jakejarvis/wait-action@master
        with:
          time: '10s'
      - name: Notify deployment finish
        uses: maxgfr/multi-deployments@main
        with:
          step: finish
          status: 'success'
          token: ${{ secrets.GITHUB_TOKEN }}
          deployment_id: ${{ steps.deployment2.outputs.deployment_id }}
          # env_url: '["https://...."]' to bind the environments url to the deployment ids
          debug: true
```
