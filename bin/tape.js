#!/usr/bin/env node
import { main } from '../src/cli.js';

const code = await main();
// null means a long-running command (ui, mcp) that keeps the process alive.
if (code !== null) process.exitCode = code;
