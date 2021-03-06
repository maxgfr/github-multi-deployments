import {DeploymentContext} from './context'

async function getEnvByRef(
  {github: client, owner, repo}: DeploymentContext,
  ref: string
): Promise<string[]> {
  const deployments = await client.rest.repos.listDeployments({
    owner,
    repo,
    ref
  })
  console.log('Deployments data')
  console.log(deployments.data)
  const envs = deployments.data.map(dep => dep.environment)
  return [...new Set(envs)] // to remove duplicates
}

export default getEnvByRef
