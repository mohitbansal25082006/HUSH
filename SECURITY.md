# Security policy

## Supported versions

Only the latest release receives fixes.

## Report a vulnerability

Please do not open a public issue. Report it privately through **GitHub → Security → Report a vulnerability** on this repository.

Include:

- what an attacker could do;
- the steps to reproduce it, and the HUSH and browser versions;
- any proof of concept.

You will hear back within 7 days. Once a fix ships, you will be credited in the release notes, unless you prefer otherwise.

## Scope

These are in scope:
- a web page escaping HUSH's isolation;
- a web page reading HUSH data;
- bypassing the hotfix signature check;
- a filter list, hotfix or page making HUSH run code;
- leaking browsing data.

A missed ad or a broken site is not a security issue. Open a regular issue for those.
