import { DeploymentContext } from "./context";

async function deleteEnvironment(
  { github: client, owner, repo }: DeploymentContext,
  environment: string
) {
  const deployments = await client.rest.repos.listDeployments({
    owner,
    repo,
    environment,
  });
  const existing = deployments.data.length;
  if (existing < 1) {
    console.log(`found no existing deployments for env ${environment}`);
    return;
  }

 
  for (let i = 0; i < existing; i++) {
    const deployment = deployments.data[i];

    console.log(
      `setting deployment '${environment}.${deployment.id}' (${deployment.sha}) "`
    );if(deployment.environment === environment) {

    await client.rest.repos.deleteAnEnvironment({
      owner,
      repo,
      environment_name: deployment.environment,
    });
  }
  }

  console.log(`${existing} deployments updated`);
}

export default deleteEnvironment;
