// Strip ANSI escape sequences (terminal colors/styles like `\x1b[32m`) so logs
// read cleanly in the UI and so URL detection isn't polluted by color codes.
// Built with String.fromCharCode(27) so the source has no literal control char
// (keeps the no-control-regex lint happy).
const ANSI_PATTERN = new RegExp(String.fromCharCode(27) + '\\[[0-9;?]*[ -/]*[@-~]', 'g')

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}
