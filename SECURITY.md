# Security

## Reporting

Use the private "Report a vulnerability" form on the Security tab of https://github.com/OWNER/tape. Please do not open a public issue for anything exploitable.

A useful report has the tape version, what an attacker controls (a token name, a logo URL, an action input, an HTTP request to `tape ui`), and the steps to reproduce. Expect an answer within seven days.

## What counts

tape writes files into other people's READMEs, so the most serious class of bug is anything that gets a script, an external reference or unescaped markup into a rendered SVG. Also in scope:

- the action writing outside the workspace through `path`, `paths` or `grid`
- the `tape ui` server answering on anything other than the host it was given, or serving files it should not
- the MCP server executing anything beyond its four tools

Fixes land on the latest release only.
