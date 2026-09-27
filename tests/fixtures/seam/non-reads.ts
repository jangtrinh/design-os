import { readFileSync, existsSync, openSync } from 'node:fs';
// readFileSync('knowledge/ghost.md')
/* readFileSync('docs/ghost.md') */
const mention = "readFileSync('README.md')";
const message = `knowledge/rules.md is useful`;
existsSync('knowledge/rules.md');
readFileSync('knowledge/personas/personas.json');
readFileSync('templates/brand/wordmark.txt');
openSync('docs/output.md', 'w');
