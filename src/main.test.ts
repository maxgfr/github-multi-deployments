/// <reference types="@types/jest" />

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setFailed: jest.fn()
}))

jest.mock('./context', () => ({
  collectDeploymentContext: jest.fn()
}))

jest.mock('./steps', () => ({
  Step: {
    Start: 'start',
    Finish: 'finish',
    DeactivateEnv: 'deactivate-env',
    DeleteEnv: 'delete-env',
    GetEnv: 'get-env'
  },
  run: jest.fn()
}))

interface MainMocks {
  getInput: jest.Mock
  setFailed: jest.Mock
  collectDeploymentContext: jest.Mock
  run: jest.Mock
}

function getMocks(): MainMocks {
  const core = jest.requireMock('@actions/core') as {
    getInput: jest.Mock
    setFailed: jest.Mock
  }
  const context = jest.requireMock('./context') as {
    collectDeploymentContext: jest.Mock
  }
  const steps = jest.requireMock('./steps') as {run: jest.Mock}
  return {
    getInput: core.getInput,
    setFailed: core.setFailed,
    collectDeploymentContext: context.collectDeploymentContext,
    run: steps.run
  }
}

function loadMain(): void {
  jest.requireActual('./main')
}

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

describe('main', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('should run the requested step', async () => {
    const mocks = getMocks()
    mocks.collectDeploymentContext.mockReturnValue({owner: 'o', repo: 'r'})
    mocks.getInput.mockReturnValue('start')
    mocks.run.mockResolvedValue(undefined)

    loadMain()
    await flushPromises()

    expect(mocks.run).toHaveBeenCalledWith('start', {owner: 'o', repo: 'r'})
    expect(mocks.setFailed).not.toHaveBeenCalled()
  })

  it('should fail for an invalid step without running it', async () => {
    const mocks = getMocks()
    mocks.collectDeploymentContext.mockReturnValue({owner: 'o', repo: 'r'})
    mocks.getInput.mockReturnValue('bogus')

    loadMain()
    await flushPromises()

    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid step')
    )
  })

  it('should report failures via setFailed without an unhandled rejection', async () => {
    const mocks = getMocks()
    mocks.collectDeploymentContext.mockImplementation(() => {
      throw new Error('boom')
    })

    const onUnhandled = jest.fn()
    process.on('unhandledRejection', onUnhandled)

    loadMain()
    await flushPromises()

    process.removeListener('unhandledRejection', onUnhandled)

    expect(mocks.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Action failed: Error: boom')
    )
    expect(onUnhandled).not.toHaveBeenCalled()
  })

  it('should report step failures via setFailed', async () => {
    const mocks = getMocks()
    mocks.collectDeploymentContext.mockReturnValue({owner: 'o', repo: 'r'})
    mocks.getInput.mockReturnValue('finish')
    mocks.run.mockRejectedValue(new Error('step exploded'))

    loadMain()
    await flushPromises()

    expect(mocks.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Action failed: Error: step exploded')
    )
  })
})
