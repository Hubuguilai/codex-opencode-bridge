import {parseArgs} from 'node:util';

const commands = {
  serve: [], init: [], 'serve-prepared': [], 'remove-prepared': [], 'recover-prepared': [],
  prepare: ['models', 'model', 'catalog'],
  'prepare-router': ['prepared', 'router-state'],
};
const needsDirectory = new Set(['prepare', 'prepare-router', 'serve-prepared', 'remove-prepared', 'recover-prepared']);

// Validate the entire invocation before configuration can create a token or
// an operation can write/remove files. Never silently accept a misspelled flag.
export function parseCommand(args) {
  const command = args[0] ?? 'serve';
  if (['help', '--help', '-h'].includes(command)) {
    if (args.length > 1) throw new Error('Help does not accept additional arguments.');
    return {command: 'help', options: {}};
  }
  if (!Object.hasOwn(commands, command)) throw new Error('Unknown command. Use --help.');
  const {values, positionals, tokens} = parseArgs({
    args: args.slice(1), strict: true, allowPositionals: true, tokens: true,
    options: {help: {type: 'boolean', short: 'h'},
      ...Object.fromEntries(commands[command].map(name => [name, {type: 'string'}]))},
  });
  const seen = new Set();
  for (const token of tokens.filter(token => token.kind === 'option')) {
    if (seen.has(token.name)) throw new Error(`Duplicate option --${token.name}.`);
    seen.add(token.name);
    if (typeof token.value === 'string' && !token.value.trim()) throw new Error(`Option --${token.name} requires a nonempty value.`);
  }
  if (positionals.length > (needsDirectory.has(command) ? 1 : 0)) throw new Error('Unexpected positional arguments. Use --help.');
  if (values.help) return {command: 'help', options: {}};
  if (needsDirectory.has(command) && !positionals[0]?.trim()) throw new Error('Provide one explicit directory. Use --help.');
  if (command === 'prepare-router') {
    for (const name of commands[command]) if (!values[name]) throw new Error(`Missing required option --${name}.`);
  }
  return {command, directory: positionals[0], options: values};
}
