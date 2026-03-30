/// <reference types="@types/jest" />

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn()
}))

jest.mock('./deactivate', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({environment: 'test', count: 0})
}))

jest.mock('./get-env', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(['env1', 'env2'])
}))

jest.mock('./retry', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withRetry: jest.fn((fn: () => Promise<any>) => fn())
}))

import {getInput, setOutput, setFailed} from '@actions/core'
import {Step, run, parseArrayOrString, parseDeploymentIds} from './steps'
import deactivateEnvironment from './deactivate'
import getEnvByRef from './get-env'
import type {DeploymentContext} from './context'

const mockGetInput = getInput as jest.Mock
const mockSetOutput = setOutput as jest.Mock
const mockSetFailed = setFailed as jest.Mock

function mockInputs(inputs: Record<string, string>) {
  mockGetInput.mockImplementation(
    (name: string, options?: {required?: boolean}) => {
      const value = inputs[name] || ''
      if (options?.required && !value) {
        throw new Error(`Input required and not supplied: ${name}`)
      }
      return value
    }
  )
}

function createMockGithub() {
  return {
    rest: {
      repos: {
        createDeployment: jest.fn().mockResolvedValue({
          data: {
            id: 1,
            sha: 'abc123',
            ref: 'main',
            environment: 'test'
          }
        }),
        createDeploymentStatus: jest.fn().mockResolvedValue({}),
        listDeployments: jest.fn(),
        deleteAnEnvironment: jest.fn().mockResolvedValue({})
      }
    },
    paginate: jest.fn().mockResolvedValue([])
  }
}

function createMockContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrides: Record<string, any> = {}
): DeploymentContext {
  const github = overrides.github || createMockGithub()
  return {
    ref: 'refs/heads/main',
    sha: 'abc123',
    owner: 'test-owner',
    repo: 'test-repo',
    github,
    coreArgs: {
      logsURL: 'https://github.com/test-owner/test-repo/commit/abc123/checks',
      desc: 'test deployment',
      isDebug: false,
      dryRun: false,
      payload: undefined,
      autoInactive: false,
      transientEnvironment: true,
      productionEnvironment: false,
      ...overrides.coreArgs
    }
  } as DeploymentContext
}

describe('steps', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('parseArrayOrString', () => {
    it('should parse JSON array', () => {
      expect(parseArrayOrString('["a", "b", "c"]')).toEqual(['a', 'b', 'c'])
    })

    it('should return single element for plain string', () => {
      expect(parseArrayOrString('hello')).toEqual(['hello'])
    })

    it('should return input as single element for empty array', () => {
      expect(parseArrayOrString('[]')).toEqual(['[]'])
    })

    it('should return input as single element for non-array JSON', () => {
      expect(parseArrayOrString('"hello"')).toEqual(['"hello"'])
    })

    it('should handle single element array', () => {
      expect(parseArrayOrString('["only"]')).toEqual(['only'])
    })

    it('should handle array with spaces', () => {
      expect(parseArrayOrString('["env A", "env B"]')).toEqual([
        'env A',
        'env B'
      ])
    })
  })

  describe('parseDeploymentIds', () => {
    it('should parse single number', () => {
      expect(parseDeploymentIds('123')).toEqual([
        {id: '123', deployment_url: ''}
      ])
    })

    it('should parse single JSON string', () => {
      expect(parseDeploymentIds('"abc"')).toEqual([
        {id: 'abc', deployment_url: ''}
      ])
    })

    it('should parse array of numbers', () => {
      expect(parseDeploymentIds('[1, 2, 3]')).toEqual([
        {id: '1', deployment_url: ''},
        {id: '2', deployment_url: ''},
        {id: '3', deployment_url: ''}
      ])
    })

    it('should parse array of objects', () => {
      const input = JSON.stringify([
        {id: '1', deployment_url: 'https://a.com'},
        {id: '2', deployment_url: 'https://b.com'}
      ])
      expect(parseDeploymentIds(input)).toEqual([
        {id: '1', deployment_url: 'https://a.com'},
        {id: '2', deployment_url: 'https://b.com'}
      ])
    })

    it('should parse single object', () => {
      const input = JSON.stringify({
        id: '1',
        deployment_url: 'https://a.com'
      })
      expect(parseDeploymentIds(input)).toEqual([
        {id: '1', deployment_url: 'https://a.com'}
      ])
    })

    it('should throw for object missing id field', () => {
      const input = JSON.stringify({deployment_url: 'https://a.com'})
      expect(() => parseDeploymentIds(input)).toThrow(
        "Deployment object missing required 'id' field"
      )
    })

    it('should throw for array element missing id field', () => {
      const input = JSON.stringify([{deployment_url: 'https://a.com'}])
      expect(() => parseDeploymentIds(input)).toThrow(
        "Deployment object missing required 'id' field"
      )
    })

    it('should throw for invalid JSON', () => {
      expect(() => parseDeploymentIds('not-json')).toThrow(
        'Failed to parse deployment_id as JSON'
      )
    })

    it('should handle object with numeric id', () => {
      const input = JSON.stringify({
        id: 42,
        deployment_url: 'https://a.com'
      })
      expect(parseDeploymentIds(input)).toEqual([
        {id: '42', deployment_url: 'https://a.com'}
      ])
    })

    it('should default deployment_url to empty string when missing', () => {
      const input = JSON.stringify({id: '1'})
      expect(parseDeploymentIds(input)).toEqual([{id: '1', deployment_url: ''}])
    })

    it('should handle mixed array of numbers and objects', () => {
      const input = JSON.stringify([
        1,
        {id: '2', deployment_url: 'https://b.com'},
        3
      ])
      expect(parseDeploymentIds(input)).toEqual([
        {id: '1', deployment_url: ''},
        {id: '2', deployment_url: 'https://b.com'},
        {id: '3', deployment_url: ''}
      ])
    })

    it('should throw for boolean JSON value', () => {
      expect(() => parseDeploymentIds('true')).toThrow(
        'Invalid deployment_id format'
      )
    })

    it('should throw for null JSON value', () => {
      expect(() => parseDeploymentIds('null')).toThrow(
        'Invalid deployment_id format'
      )
    })

    it('should throw for null element in array', () => {
      expect(() => parseDeploymentIds('[null]')).toThrow(
        'Invalid deployment data'
      )
    })
  })

  describe('run - Start step', () => {
    it('should create deployment for single environment', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({env: 'staging', ref: 'main'})

      await run(Step.Start, context)

      expect(deactivateEnvironment).toHaveBeenCalledWith(context, 'staging')
      expect(mockGithub.rest.repos.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'staging',
          ref: 'main',
          payload: ''
        })
      )
      expect(mockGithub.rest.repos.createDeploymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          deployment_id: 1,
          state: 'in_progress'
        })
      )
      expect(mockSetOutput).toHaveBeenCalledWith(
        'deployment_id',
        expect.any(String)
      )
      expect(mockSetOutput).toHaveBeenCalledWith('env', 'staging')
    })

    it('should create deployments for multiple environments', async () => {
      const mockGithub = createMockGithub()
      let id = 0
      mockGithub.rest.repos.createDeployment.mockImplementation(async () => ({
        data: {
          id: ++id,
          sha: 'abc123',
          ref: 'main',
          environment: 'test'
        }
      }))
      const context = createMockContext({github: mockGithub})

      mockInputs({env: '["staging", "production"]', ref: 'main'})

      await run(Step.Start, context)

      expect(deactivateEnvironment).toHaveBeenCalledTimes(2)
      expect(mockGithub.rest.repos.createDeployment).toHaveBeenCalledTimes(2)
      expect(
        mockGithub.rest.repos.createDeploymentStatus
      ).toHaveBeenCalledTimes(2)
    })

    it('should skip deactivation when auto_inactive is enabled', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {autoInactive: true}
      })

      mockInputs({env: 'staging', ref: 'main'})

      await run(Step.Start, context)

      expect(deactivateEnvironment).not.toHaveBeenCalled()
      expect(mockGithub.rest.repos.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({auto_inactive: true})
      )
    })

    it('should pass payload to createDeployment', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {payload: '{"version": "1.0.0"}'}
      })

      mockInputs({env: 'staging', ref: 'main'})

      await run(Step.Start, context)

      expect(mockGithub.rest.repos.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({payload: '{"version": "1.0.0"}'})
      )
    })

    it('should handle dry-run mode', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {dryRun: true}
      })

      mockInputs({env: '["staging", "production"]', ref: 'main'})

      await run(Step.Start, context)

      expect(deactivateEnvironment).not.toHaveBeenCalled()
      expect(mockGithub.rest.repos.createDeployment).not.toHaveBeenCalled()
      expect(mockSetOutput).toHaveBeenCalledWith(
        'deployment_id',
        expect.stringContaining('dry-run')
      )
      expect(mockSetOutput).toHaveBeenCalledWith(
        'env',
        '["staging", "production"]'
      )
    })

    it('should use context ref when ref input is empty', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({env: 'staging'})

      await run(Step.Start, context)

      expect(mockGithub.rest.repos.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({ref: 'refs/heads/main'})
      )
    })

    it('should fail when deployment creation fails', async () => {
      const mockGithub = createMockGithub()
      mockGithub.rest.repos.createDeployment.mockRejectedValue(
        new Error('API error')
      )
      const context = createMockContext({github: mockGithub})

      mockInputs({env: 'staging', ref: 'main'})

      await run(Step.Start, context)

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      )
    })

    it('should fail when env is not provided', async () => {
      const context = createMockContext()
      mockInputs({})

      await run(Step.Start, context)

      expect(mockSetFailed).toHaveBeenCalled()
    })

    it('should log debug info when isDebug is true', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {isDebug: true}
      })
      mockInputs({env: 'staging', ref: 'main'})

      await run(Step.Start, context)

      expect(mockGithub.rest.repos.createDeployment).toHaveBeenCalled()
      expect(mockSetOutput).toHaveBeenCalledWith('env', 'staging')
    })

    it('should fail when status creation fails', async () => {
      const mockGithub = createMockGithub()
      mockGithub.rest.repos.createDeploymentStatus.mockRejectedValue(
        new Error('Status API error')
      )
      const context = createMockContext({github: mockGithub})
      mockInputs({env: 'staging', ref: 'main'})

      await run(Step.Start, context)

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      )
    })

    it('should fail when deactivation fails', async () => {
      ;(deactivateEnvironment as jest.Mock).mockRejectedValueOnce(
        new Error('Deactivation failed')
      )
      const context = createMockContext()
      mockInputs({env: 'staging', ref: 'main'})

      await run(Step.Start, context)

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      )
    })

    it('should pass transient and production environment flags', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {
          transientEnvironment: false,
          productionEnvironment: true
        }
      })
      mockInputs({env: 'production', ref: 'main'})

      await run(Step.Start, context)

      expect(mockGithub.rest.repos.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          transient_environment: false,
          production_environment: true
        })
      )
    })
  })

  describe('run - Finish step', () => {
    it('should update deployment status to success', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([{id: '1', deployment_url: ''}]),
        env_url: 'https://example.com'
      })

      await run(Step.Finish, context)

      expect(mockGithub.rest.repos.createDeploymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          deployment_id: 1,
          state: 'success',
          environment_url: 'https://example.com'
        })
      )
    })

    it('should map cancelled to inactive', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({
        status: 'cancelled',
        deployment_id: '1'
      })

      await run(Step.Finish, context)

      expect(mockGithub.rest.repos.createDeploymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({state: 'inactive'})
      )
    })

    it('should throw for invalid status', async () => {
      const context = createMockContext()

      mockInputs({
        status: 'invalid-status',
        deployment_id: '1'
      })

      await run(Step.Finish, context)

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      )
    })

    it('should throw for length mismatch between deployment_id and env_url', async () => {
      const context = createMockContext()

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([
          {id: '1', deployment_url: ''},
          {id: '2', deployment_url: ''}
        ]),
        env_url: '["https://a.com"]'
      })

      await run(Step.Finish, context)

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      )
    })

    it('should handle dry-run mode', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {dryRun: true}
      })

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([{id: '1', deployment_url: ''}])
      })

      await run(Step.Finish, context)

      expect(
        mockGithub.rest.repos.createDeploymentStatus
      ).not.toHaveBeenCalled()
      expect(mockSetOutput).toHaveBeenCalledWith(
        'deployment_id',
        expect.stringContaining('"status":"success"')
      )
    })

    it('should set output with deployment statuses', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([
          {id: '1', deployment_url: ''},
          {id: '2', deployment_url: ''}
        ])
      })

      await run(Step.Finish, context)

      const outputCall = mockSetOutput.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === 'deployment_id'
      )
      expect(outputCall).toBeDefined()
      const output = JSON.parse(outputCall![1])
      expect(output).toEqual([
        {id: '1', status: 'success'},
        {id: '2', status: 'success'}
      ])
    })

    it('should use deployment_url as fallback when valid URL', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([
          {id: '1', deployment_url: 'https://preview.example.com'}
        ])
      })

      await run(Step.Finish, context)

      expect(mockGithub.rest.repos.createDeploymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          environment_url: 'https://preview.example.com'
        })
      )
    })

    it('should not use invalid deployment_url as fallback', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([{id: '1', deployment_url: 'not-a-url'}])
      })

      await run(Step.Finish, context)

      expect(mockGithub.rest.repos.createDeploymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          environment_url: ''
        })
      )
    })

    it('should not set environment_url for non-success status', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({
        status: 'failure',
        deployment_id: JSON.stringify([
          {id: '1', deployment_url: 'https://example.com'}
        ])
      })

      await run(Step.Finish, context)

      expect(mockGithub.rest.repos.createDeploymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          environment_url: ''
        })
      )
    })

    it('should fail when status is not provided', async () => {
      const context = createMockContext()
      mockInputs({deployment_id: '1'})

      await run(Step.Finish, context)

      expect(mockSetFailed).toHaveBeenCalled()
    })

    it('should fail when deployment_id is not provided', async () => {
      const context = createMockContext()
      mockInputs({status: 'success'})

      await run(Step.Finish, context)

      expect(mockSetFailed).toHaveBeenCalled()
    })

    it('should reject invalid env_url values', async () => {
      const context = createMockContext()

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([{id: '1', deployment_url: ''}]),
        env_url: '["not-a-valid-url"]'
      })

      await run(Step.Finish, context)

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment URL')
      )
    })

    it('should log debug info when isDebug is true', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {isDebug: true}
      })

      mockInputs({
        status: 'success',
        deployment_id: JSON.stringify([{id: '1', deployment_url: ''}])
      })

      await run(Step.Finish, context)

      expect(mockGithub.rest.repos.createDeploymentStatus).toHaveBeenCalled()
    })
  })

  describe('run - DeactivateEnv step', () => {
    it('should deactivate environments', async () => {
      const context = createMockContext()

      mockInputs({env: '["staging", "production"]'})

      await run(Step.DeactivateEnv, context)

      expect(deactivateEnvironment).toHaveBeenCalledTimes(2)
      expect(deactivateEnvironment).toHaveBeenCalledWith(context, 'staging')
      expect(deactivateEnvironment).toHaveBeenCalledWith(context, 'production')
    })

    it('should deactivate single environment', async () => {
      const context = createMockContext()

      mockInputs({env: 'staging'})

      await run(Step.DeactivateEnv, context)

      expect(deactivateEnvironment).toHaveBeenCalledTimes(1)
      expect(deactivateEnvironment).toHaveBeenCalledWith(context, 'staging')
    })

    it('should fail when env is not provided', async () => {
      const context = createMockContext()
      mockInputs({})

      await run(Step.DeactivateEnv, context)

      expect(mockSetFailed).toHaveBeenCalled()
      expect(deactivateEnvironment).not.toHaveBeenCalled()
    })

    it('should handle dry-run mode', async () => {
      const context = createMockContext({coreArgs: {dryRun: true}})

      mockInputs({env: 'staging'})

      await run(Step.DeactivateEnv, context)

      expect(deactivateEnvironment).not.toHaveBeenCalled()
    })

    it('should log debug info when isDebug is true', async () => {
      const context = createMockContext({coreArgs: {isDebug: true}})
      mockInputs({env: 'staging'})

      await run(Step.DeactivateEnv, context)

      expect(deactivateEnvironment).toHaveBeenCalledWith(context, 'staging')
    })
  })

  describe('run - DeleteEnv step', () => {
    it('should delete environments', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})

      mockInputs({env: '["staging", "production"]'})

      await run(Step.DeleteEnv, context)

      expect(mockGithub.rest.repos.deleteAnEnvironment).toHaveBeenCalledTimes(2)
      expect(mockGithub.rest.repos.deleteAnEnvironment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        environment_name: 'staging'
      })
      expect(mockGithub.rest.repos.deleteAnEnvironment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        environment_name: 'production'
      })
    })

    it('should fail when env is not provided', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({github: mockGithub})
      mockInputs({})

      await run(Step.DeleteEnv, context)

      expect(mockSetFailed).toHaveBeenCalled()
      expect(mockGithub.rest.repos.deleteAnEnvironment).not.toHaveBeenCalled()
    })

    it('should handle dry-run mode', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {dryRun: true}
      })

      mockInputs({env: 'staging'})

      await run(Step.DeleteEnv, context)

      expect(mockGithub.rest.repos.deleteAnEnvironment).not.toHaveBeenCalled()
    })

    it('should log debug info when isDebug is true', async () => {
      const mockGithub = createMockGithub()
      const context = createMockContext({
        github: mockGithub,
        coreArgs: {isDebug: true}
      })
      mockInputs({env: 'staging'})

      await run(Step.DeleteEnv, context)

      expect(mockGithub.rest.repos.deleteAnEnvironment).toHaveBeenCalled()
    })
  })

  describe('run - GetEnv step', () => {
    it('should get environments for ref', async () => {
      const context = createMockContext()

      mockInputs({ref: 'feature-branch'})

      await run(Step.GetEnv, context)

      expect(getEnvByRef).toHaveBeenCalledWith(context, 'feature-branch')
      expect(mockSetOutput).toHaveBeenCalledWith(
        'env',
        JSON.stringify(['env1', 'env2'])
      )
    })

    it('should use context ref when ref input is empty', async () => {
      const context = createMockContext()

      mockInputs({})

      await run(Step.GetEnv, context)

      expect(getEnvByRef).toHaveBeenCalledWith(context, 'refs/heads/main')
    })

    it('should log debug info when isDebug is true', async () => {
      const context = createMockContext({coreArgs: {isDebug: true}})
      mockInputs({ref: 'main'})

      await run(Step.GetEnv, context)

      expect(getEnvByRef).toHaveBeenCalledWith(context, 'main')
      expect(mockSetOutput).toHaveBeenCalledWith('env', expect.any(String))
    })
  })

  describe('run - invalid step', () => {
    it('should fail for unknown step', async () => {
      const context = createMockContext()
      mockInputs({})

      await run('unknown' as Step, context)

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('unknown step type')
      )
    })
  })
})
