// GET /api/card: tape's card as image/svg+xml. Options: see api/_tape.js and the README.
import { makeHandler } from './_tape.js';

export default makeHandler('card');
