## 2024-05-18 - [Math.random() replaced with secure randomBytes]

**Vulnerability:** [Math.random() used to generate unique IDs and temp files]
**Learning:** [Math.random() is predictable and easily exploitable. node:crypto offers a more secure alternative]
**Prevention:** [Always check for proper pseudorandom generator, such as randomBytes from node:crypto or crypto.getRandomValues()]
