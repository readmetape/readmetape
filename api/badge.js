// GET /api/badge: tape's badge as image/svg+xml. Options: see api/_tape.js and the README.
import { makeHandler } from './_tape.js';

export default makeHandler('badge');
