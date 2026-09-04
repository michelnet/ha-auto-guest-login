#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_directory=$(CDPATH= cd -- "${script_directory}/.." && pwd)
cd "$repository_directory"

owner=$(printf '%s' "${GHCR_OWNER:-michelnet}" | tr '[:upper:]' '[:lower:]')
image_name=$(printf '%s' "${IMAGE_NAME:-ha-auto-guest-login}" | tr '[:upper:]' '[:lower:]')
version=${VERSION:-$(awk -F '"' '$2 == "version" { print $4; exit }' package.json)}
platforms=${PLATFORMS:-linux/amd64,linux/arm64}
source_url=${SOURCE_URL:-https://github.com/${owner}/ha-auto-guest-login}

case "$owner" in
  ''|*[!a-z0-9._-]*)
    echo 'GHCR_OWNER may contain only lowercase letters, numbers, dots, underscores, and hyphens.' >&2
    exit 1
    ;;
esac

case "$image_name" in
  ''|*[!a-z0-9._/-]*)
    echo 'IMAGE_NAME may contain only lowercase letters, numbers, dots, underscores, hyphens, and slashes.' >&2
    exit 1
    ;;
esac

case "$version" in
  ''|*[!A-Za-z0-9._-]*)
    echo 'VERSION is empty or contains characters that are invalid in a container tag.' >&2
    exit 1
    ;;
esac

revision=unknown
dirty_worktree=0
if command -v git >/dev/null 2>&1; then
  revision=$(git rev-parse --verify HEAD 2>/dev/null || printf 'unknown')
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    revision="${revision}-dirty"
    dirty_worktree=1
  fi
fi
created=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

image="ghcr.io/${owner}/${image_name}"

printf 'Image:     %s\n' "$image"
printf 'Tags:      %s, latest\n' "$version"
printf 'Platforms: %s\n' "$platforms"
printf 'Source:    %s\n' "$source_url"
printf 'Revision:  %s\n' "$revision"
printf 'Created:   %s\n' "$created"

if [ "${DRY_RUN:-0}" = '1' ]; then
  echo 'Dry run: no image was built or pushed.'
  exit 0
fi

if [ "$dirty_worktree" = '1' ]; then
  echo 'Refusing to publish from a dirty Git working tree. Commit the release first.' >&2
  exit 1
fi

docker buildx build \
  --pull \
  --platform "$platforms" \
  --build-arg "SOURCE_URL=${source_url}" \
  --build-arg "VERSION=${version}" \
  --build-arg "REVISION=${revision}" \
  --build-arg "CREATED=${created}" \
  --tag "${image}:${version}" \
  --tag "${image}:latest" \
  --push \
  .
