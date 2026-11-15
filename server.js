/**
 * Hostinger Nest entry (must be .js).
 * Loads the Control API in-process so Hostinger sees listen() on this PID
 * (spawning a child caused "App did not call listen() within 3 seconds" / 504).
 */
const { createRequire } = require('module');
const { join } = require('path');

const apiDir = join(__dirname, 'apps', 'api');
process.chdir(apiDir);

const apiRequire = createRequire(join(apiDir, 'package.json'));
apiRequire('tsx/cjs/api').register();
apiRequire('./src/main.ts');
