#!/bin/sh
set -eu

REPO_OWNER="agentteamhq"
REPO_NAME="agentteam-email"
PROJECT_NAME="at-email"
INSTALL_SCRIPT_PATH="apps/at-email-cli/install.sh"
BIN_DIR="${HOME}/.local/bin"
BIN_DIR_EXPLICIT=0
VERSION=""

usage() {
  cat <<EOF
usage: install.sh [--version vX.Y.Z] [--bin-dir PATH]

Install at-email by downloading the raw release binary from GitHub Releases.

Examples:
  curl -fsSL https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${INSTALL_SCRIPT_PATH} | sh
  curl -fsSL https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${INSTALL_SCRIPT_PATH} | sh -s -- --version v0.1.0
EOF
}

require_value() {
  name="$1"
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "missing value for ${name}" >&2
    usage >&2
    exit 1
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      require_value "$1" "${2:-}"
      VERSION="$2"
      shift 2
      ;;
    --bin-dir)
      require_value "$1" "${2:-}"
      BIN_DIR="$2"
      BIN_DIR_EXPLICIT=1
      shift 2
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

detect_os() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    MINGW* | MSYS* | CYGWIN*) echo "windows" ;;
    *)
      echo "unsupported OS: $(uname -s)" >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo "amd64" ;;
    aarch64 | arm64) echo "arm64" ;;
    *)
      echo "unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

download() {
  url="$1"
  out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO "$out" "$url"
    return
  fi
  echo "curl or wget is required" >&2
  exit 1
}

latest_version() {
  tmp="$(mktemp)"
  download "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest" "$tmp"
  version="$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp" | head -n 1)"
  rm -f "$tmp"
  if [ -z "$version" ]; then
    echo "failed to resolve latest version" >&2
    exit 1
  fi
  printf '%s\n' "$version"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return
  fi
  echo "sha256sum or shasum is required" >&2
  exit 1
}

is_in_path() {
  dir="$1"
  case ":$PATH:" in
    *":${dir}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

is_writable_dir_or_creatable() {
  dir="$1"
  if [ -d "$dir" ]; then
    [ -w "$dir" ]
    return
  fi
  parent="$(dirname "$dir")"
  while [ "$parent" != "/" ] && [ ! -d "$parent" ]; do
    parent="$(dirname "$parent")"
  done
  [ -d "$parent" ] && [ -w "$parent" ]
}

choose_bin_dir() {
  if [ "$BIN_DIR_EXPLICIT" -eq 1 ]; then
    printf '%s\n' "$BIN_DIR"
    return
  fi

  home_local="${HOME}/.local/bin"
  home_bin="${HOME}/bin"

  for dir in "$home_local" "$home_bin"; do
    if is_in_path "$dir" && is_writable_dir_or_creatable "$dir"; then
      printf '%s\n' "$dir"
      return
    fi
  done

  old_ifs="${IFS}"
  IFS=":"
  for dir in $PATH; do
    [ -n "$dir" ] || continue
    case "$dir" in
      "$HOME"/*)
        if is_writable_dir_or_creatable "$dir"; then
          printf '%s\n' "$dir"
          IFS="${old_ifs}"
          return
        fi
        ;;
    esac
  done

  for dir in $PATH; do
    [ -n "$dir" ] || continue
    if [ "$dir" = "/usr/local/bin" ] && is_writable_dir_or_creatable "$dir"; then
      printf '%s\n' "$dir"
      IFS="${old_ifs}"
      return
    fi
  done

  for dir in $PATH; do
    [ -n "$dir" ] || continue
    if is_writable_dir_or_creatable "$dir"; then
      printf '%s\n' "$dir"
      IFS="${old_ifs}"
      return
    fi
  done
  IFS="${old_ifs}"

  printf '%s\n' "$home_local"
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
BIN_DIR="$(choose_bin_dir)"

if [ -z "$VERSION" ]; then
  VERSION="$(latest_version)"
fi

case "$VERSION" in
  v*) ;;
  *) VERSION="v${VERSION}" ;;
esac

ASSET="${PROJECT_NAME}_${VERSION#v}_${OS}_${ARCH}"
if [ "$OS" = "windows" ]; then
  ASSET="${ASSET}.exe"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

BINARY_PATH="${TMP_DIR}/${ASSET}"
CHECKSUMS_PATH="${TMP_DIR}/checksums.txt"

download "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${VERSION}/${ASSET}" "$BINARY_PATH"
download "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${VERSION}/checksums.txt" "$CHECKSUMS_PATH"

EXPECTED="$(awk -v asset="${ASSET}" '$2 == asset || $2 == "*" asset { print $1 }' "$CHECKSUMS_PATH" | head -n 1)"
if [ -z "$EXPECTED" ]; then
  echo "checksum entry not found for ${ASSET}" >&2
  exit 1
fi

ACTUAL="$(sha256_file "$BINARY_PATH")"
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "checksum mismatch for ${ASSET}" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"
TARGET="${BIN_DIR}/at-email"
if [ "$OS" = "windows" ]; then
  TARGET="${TARGET}.exe"
fi
cp "$BINARY_PATH" "$TARGET"
chmod 0755 "$TARGET"

echo "installed ${TARGET}"
if ! is_in_path "$BIN_DIR"; then
  echo "installed to ${BIN_DIR}, which is not currently on PATH" >&2
  echo "add it with:" >&2
  echo "  export PATH=\"${BIN_DIR}:\$PATH\"" >&2
fi
