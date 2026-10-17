# Writing discovery and migration output files

By default, the CLI validates output data, strips sensitive fields, writes to a temporary file next to the target path, and renames the file into place without overwriting existing files (`CLI-OUT-001`).

```text
scans/
├── discovery-bundle.json
├── migration-plan.json
└── verification-report.json
```

To save a discovery bundle to the default `./scans` folder:

```bash
npm run dev:cli -- discover --modules all --organization "fictional-north"
```

To write the output bundle to a specific file path:

```bash
npm run dev:cli -- discover \
  --modules all \
  --organization "fictional-north" \
  --output ./scans/fictional-north-bundle.json
```

> [!NOTE]
> The output writer refuses to overwrite an existing file so you never accidentally erase saved discovery evidence.
