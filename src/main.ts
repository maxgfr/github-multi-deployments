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

    const stepInput = core.getInput('step', {required: true})
    const validSteps = Object.values(Step) as string[]

    if (!validSteps.includes(stepInput)) {
      core.setFailed(
        `Invalid step "${stepInput}". Must be one of: ${validSteps.join(', ')}`
      )
      return
    }

    await run(stepInput as Step, context)
  } catch (error) {
    core.setFailed(`Action failed: ${error}`)
    throw error
  }
}

main()
