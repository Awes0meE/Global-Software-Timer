# Security Policy

Global Software Timer is privacy-first software. Security reports are taken seriously, especially issues that could expose local usage data, weaken update/download trust, or expand data collection beyond the documented privacy boundary.

## Supported Versions

The latest public release is the supported version for security reports.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a Vulnerability

Please do not open a public GitHub issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting feature if it is available on this repository. If it is not available, contact the maintainer through the GitHub profile linked from the repository owner.

Include:

- A clear description of the issue.
- Steps to reproduce.
- Expected and actual behavior.
- Affected version or commit.
- Whether local data, privacy boundaries, installers, or permissions are involved.

## Security Boundaries

v0.1.x should not:

- Upload usage data.
- Require an account.
- Request administrator permission by default.
- Collect window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, browser history, or cloud data.

Any contribution that changes these boundaries must be explicit, documented, opt-in, and reviewed carefully.
