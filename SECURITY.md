# Security reporting

OpenBot is a development beta, not an audited security product. Its tools can read private information and act on external accounts when authorized. Please read the [security model and known limitations](docs/SECURITY.md) before granting access.

## Report privately

Use the repository's **Security → Report a vulnerability** control when available: [private report](https://github.com/PrisacariuRobert/openbot/security/advisories/new).

Private vulnerability reporting was **enabled on 2026-09-06** and the repository API confirmed it is enabled. Use the private report link above; no test report was submitted. If the control is unavailable to you, do not post an exploit, token, database, browser profile or private conversation in a public issue. You may open a minimal issue titled “Request a private security contact,” containing no technical or personal details, and wait for a private route from the repository owner.

A useful private report contains the affected version/commit and platform, impact, minimal synthetic reproduction, required permissions and any proposed mitigation. Do not test against other users, public relay infrastructure or accounts you do not control. No response-time guarantee or paid bounty program is currently offered.

## Supported scope

Security fixes target the latest development source and the next explicitly published beta. There is no LTS or promise of backports to historical `0.x` versions. A version number in README is not evidence of a signed or reviewed downloadable release. Check release notes and the [first public beta checklist](docs/FIRST_PUBLIC_RELEASE.md).

## If a credential was exposed

Revoke or rotate it with its issuing provider first. Deleting it in a later Git commit does not remove copies in repository history, forks, logs or downloaded archives. Stop the affected workflow, preserve only redacted evidence and contact the owner through a private route. Do not attach `.openbot`, home-transfer archives, OAuth JSON credentials, signing keys or Keychain exports to reports.

Local secret encryption does not protect against a compromised host account that can read both the database and vault key. A saved browser session is an account credential. Approval checks, URL classification and constrained containers reduce risk; they are not a universal network sandbox or a guarantee against every prompt injection. Models and imported content remain untrusted.
