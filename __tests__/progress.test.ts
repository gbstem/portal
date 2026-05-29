import progress from '../src/lib/client/progress'
import nProgress from 'nprogress'

jest.mock('nprogress', () => ({
  configure: jest.fn(),
  start: jest.fn(),
  done: jest.fn(),
}))

describe('progress', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('configures and starts progress bar after delay', () => {
    progress.start()
    expect(nProgress.configure).toHaveBeenCalledWith({ showSpinner: false })

    // progress bar should not start immediately
    expect(nProgress.start).not.toHaveBeenCalled()

    // fast-forward time
    jest.advanceTimersByTime(120)
    expect(nProgress.start).toHaveBeenCalled()
  })

  it('completes the progress bar and clears timeout', () => {
    progress.start()
    progress.done()

    expect(nProgress.done).toHaveBeenCalled()

    // fast-forward time, nProgress.start should not be called since timeout was cleared
    jest.advanceTimersByTime(120)
    expect(nProgress.start).not.toHaveBeenCalled()
  })
})
