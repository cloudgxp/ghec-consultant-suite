## 2024-05-18 - [Math.random() replaced with secure randomBytes]

**Vulnerability:** [Math.random() used to generate unique IDs and temp files]
**Learning:** [Math.random() is predictable and easily exploitable. node:crypto offers a more secure alternative]
**Prevention:** [Always check for proper pseudorandom generator, such as randomBytes from node:crypto or crypto.getRandomValues()]

## 2025-02-27 - [Fix Formula Injection Vulnerability in CSV Export]

**Vulnerability:** Found CSV formula injection where `\n` characters were not included in `FORMULA_TRIGGERS` array and regex for testing.
**Learning:** `\n` character is an additional spreadsheet formula execution trigger when files are opened in some processors like Excel.
**Prevention:** Include `\n` as one of the strings alongside `=`, `+`, `-`, `@`, `\t`, `\r` to be sanitized to prevent code injection via spreadsheet cells.
