import { readFileSync as load, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path'; const root = join(process.cwd(), 'knowledge');
load(join(root, 'rules.md'), 'utf8');
readFile('README.md', 'utf8');
openSync(join('docs', 'guide.md'), 'r');
load(`templates/${name}.md`);
load('knowledge/' + name + '.md');
