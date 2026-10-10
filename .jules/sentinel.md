## 2024-05-18 - [Math.random() replaced with secure randomBytes]

**Vulnerability:** [Math.random() used to generate unique IDs and temp files]
**Learning:** [Math.random() is predictable and easily exploitable. node:crypto offers a more secure alternative]
**Prevention:** [Always check for proper pseudorandom generator, such as randomBytes from node:crypto or crypto.getRandomValues()]
## 2026-10-10 - [Replace Predictable Math.random() with secure randomUUID()]\n**Vulnerability:** [Predictable IDs created by Math.random() in SSE clients]\n**Learning:** [Math.random() is predictable. In security-sensitive code paths or when creating non-colliding IDs, robust alternatives like randomUUID() or randomBytes() from node:crypto should be used]\n**Prevention:** [Review new and existing ID generators, especially for connection handles or tokens, to ensure they use a secure PRNG]
