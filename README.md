# HA Auto Guest Login

HA Auto Guest Login gives trusted local guests one-click access to a restricted
Home Assistant account. It runs as a standalone Docker container.

> [!WARNING]
> This service turns access to its guest URL into access to the configured Home
> Assistant account. Publish it only on a trusted LAN, never on the public
> internet, and use a non-administrator guest with minimal permissions.

## Standalone Docker

### Run the published image

The [GHCR Compose example](compose.ghcr.yaml) downloads the ready-to-run image
from GitHub Container Registry and does not build anything locally:

```sh
cp .env.example .env
# Edit .env before starting the service.
docker compose --file compose.ghcr.yaml pull
docker compose --file compose.ghcr.yaml up --detach
```

The example uses `latest` and checks for a newer image whenever the service is
started. For a reproducible deployment, replace `latest` in
`compose.ghcr.yaml` with a release tag such as `2.0.0`.

To update an existing installation:

```sh
docker compose --file compose.ghcr.yaml pull
docker compose --file compose.ghcr.yaml up --detach
```

The GHCR package must be public. If it is private, authenticate Docker to
`ghcr.io` before running these commands.

### Build locally

Copy and edit the example configuration:

```sh
cp .env.example .env
docker compose up --build --detach
```

The service is then available at:

- Admin page and QR code: <http://localhost:8675/admin>
- Liveness check: <http://localhost:8675/healthz>
- Guest login: <http://localhost:8675/>

`HA_INTERNAL_URL` must be reachable from the container. `HA_PUBLIC_URL` must be
reachable from each guest's browser. These URLs are often identical, but can
differ when Docker DNS, split DNS, or a reverse proxy is used.

To build and run locally without Compose:

```sh
docker build --tag ha-auto-guest-login .
docker run --detach \
  --name ha-auto-guest-login \
  --restart unless-stopped \
  --publish 8675:8080 \
  --env-file .env \
  --add-host host.docker.internal:host-gateway \
  ha-auto-guest-login
```

## Publish to GitHub Container Registry

The [container publishing workflow](.github/workflows/publish-container.yml)
tests, builds, and publishes the image to GitHub Container Registry. It uses the
repository's built-in `GITHUB_TOKEN`; no additional registry secret is needed.

Every push to `main` updates `latest` and adds a commit SHA tag. After updating
the version in `package.json`, push the matching semantic version tag to publish
versioned tags as well:

```sh
git tag v2.0.0
git push origin v2.0.0
```

This publishes `2.0.0`, `2.0`, `2`, `latest`, and a commit SHA tag for both
AMD64 and ARM64. The workflow can also be started manually from GitHub's
**Actions** tab.

The default target is `ghcr.io/michelnet/ha-auto-guest-login`. New packages are
private by default. Change the package visibility in GitHub's package settings
if guests should be able to pull the image without signing in. See GitHub's
[Container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
for permission and visibility details.

For an optional manual publish from your local machine, first authenticate to
GHCR with a classic personal access token containing `write:packages`, then run:

```sh
./scripts/publish-ghcr.sh
```

Override the local target when needed:

```sh
GHCR_OWNER=your-github-user VERSION=2.0.1 ./scripts/publish-ghcr.sh
```

See [the complete configuration and operations guide](DOCS.md)
for all environment variables, Docker networking, secrets, reverse proxies,
Home Assistant setup, and troubleshooting.

## Credits

This project is based on the original
[HA Auto Guest Login](https://github.com/cnorick/ha-auto-guest-login) by
[Nathan Orick](https://github.com/cnorick). Credit for the original idea and
implementation belongs to him. This fork focuses on standalone Docker usage.
