import { LauncherError, parseLauncherArguments, runLauncher } from './launch.mjs'

let disposeContinueListener = () => {}

function waitForContinueAfterAnalyticsHealth(analyticsPid) {
  if (!process.connected || typeof process.send !== 'function') {
    throw new LauncherError('Adversarial launcher requires an IPC parent.')
  }
  process.send({ type: 'analytics-healthy', analyticsPid })
  return new Promise((resolvePromise) => {
    const continueStartup = (message) => {
      if (message?.type !== 'continue-after-analytics-health') return
      process.removeListener('message', continueStartup)
      disposeContinueListener = () => {}
      resolvePromise()
    }
    disposeContinueListener = () => process.removeListener('message', continueStartup)
    process.on('message', continueStartup)
  })
}

try {
  const options = parseLauncherArguments(process.argv.slice(2))
  await runLauncher(options, {
    afterAnalyticsHealth: ({ analyticsPid }) =>
      waitForContinueAfterAnalyticsHealth(analyticsPid),
  })
} catch (error) {
  const message = error instanceof LauncherError ? error.message : 'Launcher failed unexpectedly.'
  console.error(`[H2 Sentinel] ${message}`)
  process.exitCode = 1
} finally {
  disposeContinueListener()
  if (process.connected) process.disconnect()
}
