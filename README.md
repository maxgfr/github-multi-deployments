# GitHub Multi Deployments [![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://maxgfr.dev/r/multi-deployments/) [![pipeline](https://img.shields.io/github/workflow/status/maxgfr/multi-deployments/build-test)](https://github.com/maxgfr/multi-deployments/actions/workflows/build.yaml)

`maxgfr/multi-deployments` is a [GitHub Action](https://github.com/features/actions) based on [`bobheadxi/deployments`](https://github.com/bobheadxi/deployments).

It enables you to deploy multiple environments in a single workflow.

:warning: Before dig into this action, you may check [bobheadxi actions](https://github.com/marketplace/actions/github-deployments).

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
        uses: ./
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
        uses: ./
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
        uses: ./
        with:
          step: delete-env
          token: ${{ secrets.GH_PAT_TOKEN }}
          env: '["envA", "envB"]'
          debug: true
      - name: Sleep for 10 seconds
        uses: jakejarvis/wait-action@master
        with:
          time: '10s'
      - name: Notify deployment start
        uses: ./
        id: deployment2
        with:
          step: start
          token: ${{ secrets.GITHUB_TOKEN }}
          description: 'Deploying environment C and environment D'
          env: '["envC", "envD"]'
          debug: true
      - name: Sleep for 10 seconds
        uses: jakejarvis/wait-action@master
        with:
          time: '10s'
      - name: Notify deployment finish
        uses: ./
        with:
          step: finish
          status: 'success'
          token: ${{ secrets.GITHUB_TOKEN }}
          deployment_id: ${{ steps.deployment2.outputs.deployment_id }}
          debug: true
```
