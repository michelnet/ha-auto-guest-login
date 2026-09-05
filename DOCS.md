# Using HA Auto Guest Login

## Security model

Anyone who can open the guest-login URL can receive a Home Assistant session for
the configured account. Keep the service on a trusted local network and:

1. Create a dedicated Home Assistant user with **Administrator** disabled.
2. Give that user access only to an intentionally limited guest dashboard and
   the minimum required entities.
3. Enable **Can only log in from the local network** where appropriate.
4. Do not expose port 8675, or an equivalent reverse-proxy route, to the
   internet.

The login flow uses Home Assistant's built-in `homeassistant` authentication
provider. Accounts requiring MFA or a different provider are not supported.

## Create the Home Assistant account and dashboard

Create the guest account under **Settings → People → Users**. Save its username
and password.

Create or select a guest dashboard under **Settings → Dashboards**. Record the
part of its URL after the leading slash. For
`http://homeassistant.local:8123/lovelace-guest/home`, configure
`lovelace-guest/home`.

## Standalone Docker

### Compose

Copy and edit the environment configuration first:

```sh
cp .env.example .env
```

To download and run the published image from GitHub Container Registry:

```sh
docker compose --file compose.ghcr.yaml pull
docker compose --file compose.ghcr.yaml up --detach
docker compose --file compose.ghcr.yaml logs --follow
```

The registry example uses
`ghcr.io/michelnet/ha-auto-guest-login:latest` with `pull_policy: always`. Pin
the image in `compose.ghcr.yaml` to a release tag such as `2.0.0` when automatic
updates to `latest` are not desired. The package must be public, or Docker must
already be authenticated to `ghcr.io`.

Update a running registry-based installation with:

```sh
docker compose --file compose.ghcr.yaml pull
docker compose --file compose.ghcr.yaml up --detach
```

To build the image locally from the repository instead:

```sh
docker compose up --build --detach
docker compose logs --follow
```

Open `http://<docker-host>:8675/admin` to check the generated guest URL and QR
code. Test the guest URL in a private browser window.

Both supplied Compose files run the container read-only, drop Linux
capabilities, set `no-new-privileges`, and add a small temporary `/tmp`.
`compose.yaml` builds locally, while `compose.ghcr.yaml` pulls the published
image. The application itself stores no persistent data.

### Direct Docker run

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

### Publish to GitHub Container Registry

The workflow in `.github/workflows/publish-container.yml` runs the tests, builds
the image for `linux/amd64` and `linux/arm64`, and publishes it to
`ghcr.io/michelnet/ha-auto-guest-login`. It authenticates with the repository's
`GITHUB_TOKEN`, which is limited to `contents: read` and `packages: write`.

Pushes to `main` publish `latest` and a commit SHA tag. For a versioned release,
update `package.json` and push the matching semantic version tag:

```sh
git tag v2.0.0
git push origin v2.0.0
```

The resulting tags are `2.0.0`, `2.0`, `2`, `latest`, and `sha-<commit>`. You
can also start the workflow manually from GitHub's **Actions** tab.

For an optional local publish, authenticate Docker using a GitHub personal
access token (classic) with `write:packages`, then run:

```sh
./scripts/publish-ghcr.sh
```

Commit the intended release first. To keep the OCI revision metadata reliable,
the script refuses to publish while the Git working tree contains changes.

Supported overrides are `GHCR_OWNER`, `IMAGE_NAME`, `VERSION`, `PLATFORMS`, and
`SOURCE_URL`. Preview the resolved settings without building or pushing:

```sh
DRY_RUN=1 GHCR_OWNER=your-github-user ./scripts/publish-ghcr.sh
```

GitHub creates a new package as private; adjust its visibility in the package
settings when the image should be publicly pullable.

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GUEST_USERNAME` | Yes | — | Home Assistant guest username. |
| `GUEST_PASSWORD` | Yes* | — | Guest password. Use this or `GUEST_PASSWORD_FILE`, not both. |
| `GUEST_PASSWORD_FILE` | Yes* | — | Path to a mounted file containing the guest password. |
| `HA_INTERNAL_URL` | Yes | — | Home Assistant base URL reachable from inside the container. |
| `HA_PUBLIC_URL` | No | `HA_INTERNAL_URL` | Home Assistant base URL reachable from guest browsers. |
| `APP_PUBLIC_URL` | No | Current request origin | Public base URL of this service, used on the admin page and in its QR code. |
| `GUEST_DASHBOARD_PATH` | No | `lovelace/default_view` | Relative dashboard path without a leading slash. |
| `WELCOME_SCREEN_DELAY_MS` | No | `3000` | Minimum welcome-screen duration, from 0 to 300000 ms. |
| `WELCOME_SCREEN_MAIN_TEXT` | No | `Thanks for Visiting` | Welcome heading. |
| `WELCOME_SCREEN_SECONDARY_TEXT` | No | `Redirecting to Home Assistant...` | Welcome subheading. |
| `HA_TOKEN` | No | — | Long-lived Home Assistant access token used only to emit the login event. |
| `HA_TOKEN_FILE` | No | — | Path to a mounted file containing `HA_TOKEN`. |
| `PORT` | No | `8080` | Container HTTP port. |
| `TRUST_PROXY` | No | `false` | Trust reverse-proxy forwarding headers. Enable only behind a trusted proxy. |

`HOME_ASSISTANT_URL`, `HOME_ASSISTANT_REDIRECT_URL`, `PUBLIC_URL`,
`HOME_ASSISTANT_TOKEN`, and `HOME_ASSISTANT_TOKEN_FILE` are accepted as aliases
for the corresponding variables above.

`HA_TOKEN` is not needed for automatic login. Without it, only the optional
`ha_auto_login_guest_logged_in` event is disabled.

When changing `PORT`, map the same container port in a direct `docker run`
command. The supplied Compose file adjusts its target port automatically.

For Docker secrets, mount a read-only file and set the corresponding `_FILE`
variable:

```yaml
services:
  ha-auto-guest-login:
    environment:
      GUEST_PASSWORD_FILE: /run/secrets/guest_password
    secrets:
      - guest_password

secrets:
  guest_password:
    file: ./guest-password.txt
```

### Docker networking

`localhost` inside the container refers to the container itself, not the Docker
host.

- Docker Desktop: use `http://host.docker.internal:8123` for Home Assistant on
  the host.
- Linux: the supplied Compose file maps `host.docker.internal` to the host
  gateway.
- Home Assistant in another container: attach both services to the same Docker
  network and use its service name, for example
  `HA_INTERNAL_URL=http://home-assistant:8123`.

The public URL should use the DNS name or IP address that guest devices use,
such as `HA_PUBLIC_URL=http://homeassistant.local:8123`.

### Reverse proxy

Set fixed `HA_PUBLIC_URL` and `APP_PUBLIC_URL` values when using a reverse proxy.
Set `TRUST_PROXY=true` only when direct access to the application port is
blocked and the proxy overwrites forwarded headers. The current application
expects to be served at the URL root, not below a path prefix.

For private certificate authorities, mount the CA certificate and configure
Node with `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`. Do not disable TLS certificate
verification.

## Dashboard override

Append `?dashboard=<path>` or `?d=<path>` to the guest URL to redirect a guest
to a different dashboard for that login:

```text
http://docker-host.local:8675/?d=lovelace-kitchen/home
```

## Login event

When event authorization is available, the service emits:

```yaml
event_type: ha_auto_login_guest_logged_in
data:
  ip: "192.168.1.99"
```

Emitting this event requires `HA_TOKEN` or `HA_TOKEN_FILE`. Use a long-lived
token for a minimally privileged Home Assistant user.

## Operations and troubleshooting

The liveness endpoint checks only the local process and deliberately does not
contact Home Assistant:

```sh
curl --fail http://localhost:8675/healthz
docker inspect --format '{{json .State.Health}}' ha-auto-guest-login
```

If login fails:

1. Check `docker compose logs`.
2. Verify `HA_INTERNAL_URL` from the Docker network.
3. Verify `HA_PUBLIC_URL` from a guest device.
4. Confirm the guest credentials by logging into Home Assistant manually.
5. Confirm that the built-in Home Assistant authentication provider is enabled.

The service does not log passwords, tokens, one-time authentication codes, or
generated redirect URLs.
