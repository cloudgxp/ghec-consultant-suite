# Custom Roles Migration Module (`custom-roles`)

The `custom-roles` module discovers, plans, applies, and verifies **Custom Repository Roles** and **Custom Organization Roles** in GitHub Enterprise Cloud (GHEC) and GHEC-EMU organizations.

---

## Background & Architecture

In GHEC and GHEC-EMU:

1. **Custom Repository Roles**: Built on top of base repository roles (`read`, `triage`, `write`, `maintain`, `admin`) with additional fine-grained permissions. Managed via `GET /orgs/{org}/custom-repository-roles` and `POST /orgs/{org}/custom-repository-roles`.
2. **Custom Organization Roles**: Organization-level permissions granting access to specific organization settings, audit logs, or repository management functions. Managed via `GET /orgs/{org}/organization-roles` and `POST /orgs/{org}/organization-roles`.
3. **Role Binding Prerequisite**: Recreating custom roles at the organization level is a hard dependency before teams or outside collaborators can be assigned these roles on repositories or organization scopes.

---

## 4-Stage Lifecycle

```
[ Discover ] ---> [ Plan ] ---> [ Apply ] ---> [ Verify ]
```

1. **Discover**:
   - Queries source organization custom repository roles via `GET /orgs/{org}/custom-repository-roles`.
   - Queries source organization custom organization roles via `GET /orgs/{org}/organization-roles`.
   - Normalizes base roles and permission arrays.
2. **Plan**:
   - Queries target organization for existing custom repository and organization roles.
   - Computes planned operations:
     - `create`: Missing roles at destination.
     - `update`: Existing roles where permissions, base role, or description differ.
     - `noop`: Existing roles that already match target configuration.
3. **Apply**:
   - Creates or updates custom repository roles on target organization.
   - Creates or updates custom organization roles on target organization.
   - Respects `dryRun` and `--continue-on-error`.
4. **Verify**:
   - Audits destination custom repository and organization roles.
   - Compares permission arrays and base roles, reporting structured `VerificationDiscrepancy` entries on mismatch or absence.
