import * as core from '@actions/core'
import {collectDeploymentContext} from './context'
import {Step, run} from './steps'

/**
 * Main entry point for the GitHub Action.
 * Collects deployment context and executes the requested step.
 */
async function main(): Promise<void> {
  try {
    const context = collectDeploymentContext()
    console.log(`targeting ${context.owner}/${context.repo}`)

    const step = core.getInput('step', {required: true}) as Step

    await run(step, context)
  } catch (error) {
    core.setFailed(`Action failed: ${error}`)
    throw error
  }
}

main()
