# Release Checklist

Use this before pushing a UX/refactor change to production.

## Local Gates

```powershell
npm run test:product
npm run qa:quick
npm run qa:full
```

Run the secret/PII scan against `README.md`, `docs`, `src` and `tests`. Expected findings must be test fixtures or documented placeholders only.

## Build And Deploy

```powershell
vercel build --prod
vercel deploy --prebuilt --prod --archive=tgz --yes
```

Production alias must resolve to `https://agente-pagos-stellar.vercel.app`.

## Smoke Checks

Open or fetch:

- `/`
- `/discover`
- `/spend`
- `/activity`
- `/wallet`
- `/api/home`
- `/api/providers?q=audio%20corto`
- `/api/providers?q=creditos%20API`

Then check:

```powershell
vercel logs https://agente-pagos-stellar.vercel.app --level error --since 10m --no-follow
```

No financial gates should be opened during a UX/refactor release.