import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
export const project = fileURLToPath(new URL('../', import.meta.url));
config({ path: path.join(project, '.env'), quiet: true });
// The MCP client (Claude Code, Cursor, ...) starts this server in the user's project folder, so the
// working directory is the workspace. Broad or unrelated folders are never treated as a workspace.
export function detectWorkspace(cwd: string, explicit?: string): string | undefined {
  if (explicit) return path.resolve(explicit);
  const dir = path.resolve(cwd);
  const same = (a: string, b: string) => path.relative(path.resolve(a), dir) === '';
  const inside = (a: string) => { const rel = path.relative(path.resolve(a), dir); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
  if (dir === path.parse(dir).root || same(os.homedir(), dir) || inside(project)) return undefined;
  const sysRoots = [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData, process.env.LOCALAPPDATA, process.env.APPDATA].filter((p): p is string => Boolean(p));
  if (sysRoots.some(inside)) return undefined;
  return dir;
}
const workspace = process.env.IMAGE_USE_WORKSPACE === 'false' ? undefined : detectWorkspace(process.cwd(), process.env.IMAGE_WORKSPACE || undefined);
export const settings = {
  workspace,
  test: process.env.IMAGE_TEST_MODE !== 'false',
  browserMode: process.env.IMAGE_BROWSER_MODE || 'extension',
  enabled: process.env.IMAGE_ALLOW_BROWSER_GENERATION === 'true',
  output: path.resolve(project, process.env.IMAGE_OUTPUT_DIR || 'output'),
  allowed: (process.env.IMAGE_ALLOWED_DIRS || '').split(';').filter(Boolean).map(p => path.resolve(project,p)),
  profile: path.resolve(project, process.env.IMAGE_BROWSER_PROFILE || '.browser-profile'),
  channel: process.env.IMAGE_BROWSER_CHANNEL || undefined,
  timeout: Number(process.env.IMAGE_TIMEOUT_MS || 300000),
  prompt: process.env.IMAGE_PROMPT_SELECTOR || '#prompt-textarea',
  send: process.env.IMAGE_SEND_SELECTOR || 'button[data-testid="send-button"]',
  result: process.env.IMAGE_RESULT_SELECTOR || '[data-message-author-role="assistant"] img',
  download: process.env.IMAGE_DOWNLOAD_SELECTOR || 'button[aria-label*="Download"],button[aria-label*="下载"]',
};
if (!Number.isFinite(settings.timeout) || settings.timeout < 1000 || settings.timeout > 600000) throw new Error('IMAGE_TIMEOUT_MS must be 1000..600000');
if(!['extension','playwright'].includes(settings.browserMode))throw new Error('IMAGE_BROWSER_MODE must be extension or playwright');
