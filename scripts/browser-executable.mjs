// Capture the override before isolated runners remove RIFTCAST_* from their environment.
const executablePath = process.env.RIFTCAST_BROWSER_EXECUTABLE || process.env.RIFTCAST_CHROMIUM_PATH;

export function browserExecutable(defaultBrowser = {}) {
  return executablePath ? { executablePath } : defaultBrowser;
}
