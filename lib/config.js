import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VALID_MODES = ['basic', 'enhanced', 'full'];
const DEFAULT_JOURNEY_DIR = join(homedir(), '.claude', 'journey');

export function readConfig(journeyDir = DEFAULT_JOURNEY_DIR) {
  const configPath = join(journeyDir, 'config.md');

  if (!existsSync(configPath)) {
    return { mode: 'basic', voice: '' };
  }

  let content;
  try {
    content = readFileSync(configPath, 'utf8');
  } catch {
    return { mode: 'basic', voice: '' };
  }

  const modeMatch = content.match(/^-\s*mode:\s*(\w+)/m);
  const mode = modeMatch && VALID_MODES.includes(modeMatch[1]) ? modeMatch[1] : 'basic';

  const voiceMatch = content.match(/^## Voice\s*\n([\s\S]*?)(?=\n## |\n*$)/m);
  const voice = voiceMatch ? voiceMatch[1].trim() : '';

  return { mode, voice };
}
