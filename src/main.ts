import * as core from '@actions/core'
import {collectDeploymentContext} from './context'
import {Step, run} from './steps'

const context = collectDeploymentContext()
console.log(`targeting ${context.owner}/${context.repo}`)

const step = core.getInput('step', {required: true}) as Step
run(step, context)
