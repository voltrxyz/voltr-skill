#!/usr/bin/env bash
# Voltr Dev Skill installer.
# Installs this skill into Claude Code / Codex (as a folder skill) or into an
# editor's rules file (as a single flattened markdown doc).
set -euo pipefail

SKILL_NAME="voltr"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO/skills/$SKILL_NAME"   # the skill folder (SKILL.md + references/ + examples/)
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

err()  { printf 'Error: %s\n' "$1" >&2; exit 1; }
info() { printf '  ✓ %s\n' "$1"; }

[ -f "$SRC/SKILL.md" ] || err "SKILL.md not found in $SRC — run this from the skill repo root."

usage() {
  cat <<'EOF'
Voltr Dev Skill installer

Usage: ./install.sh [targets] [modifiers]

Per-user folder skills:
  --claude       ~/.claude/skills/voltr            (default when no target is given)
  --codex        ${CODEX_HOME:-~/.codex}/skills/voltr

Project-scoped single-file rules (written into the current repo):
  --cursor       .cursor/rules/voltr.mdc
  --windsurf     .windsurf/rules/voltr.md
  --cline        .clinerules/voltr.md
  --continue     .continue/rules/voltr.md
  --agents-md    AGENTS.md (appended)

Modifiers:
  --project      put --claude/--codex under ./.claude or ./.codex instead of $HOME
  --all          --claude and --codex
  --path DIR     copy the full skill folder to DIR (cannot combine with other flags)
  -h, --help     show this help

Quick install (no clone): npx add-skill https://github.com/voltrxyz/voltr-skill
EOF
}

# Concatenate SKILL.md + references/*.md into one markdown doc on stdout.
flatten() {
  cat "$SRC/SKILL.md"
  local f
  for f in "$SRC"/references/*.md; do
    printf '\n\n---\n\n'
    cat "$f"
  done
}

confirm_overwrite() {
  # $1 = path. Returns 0 to proceed, 1 to skip.
  [ -e "$1" ] || return 0
  printf 'Overwrite existing %s? [y/N] ' "$1"
  read -r ans </dev/tty || ans=""
  case "$ans" in y|Y|yes|YES) return 0 ;; *) info "skipped $1"; return 1 ;; esac
}

copy_folder() {
  local dest="$1"
  confirm_overwrite "$dest" || return 0
  rm -rf "$dest"; mkdir -p "$dest"
  cp -R "$SRC/SKILL.md" "$SRC/references" "$SRC/examples" "$dest/"
  info "folder skill → $dest"
}

write_flat() {
  # $1 = dest file, $2 = optional header (frontmatter) printed before the body
  local dest="$1" header="${2:-}"
  confirm_overwrite "$dest" || return 0
  mkdir -p "$(dirname "$dest")"
  { [ -n "$header" ] && printf '%s\n' "$header"; flatten; } > "$dest"
  info "rules file → $dest"
}

append_flat() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  { printf '\n<!-- BEGIN voltr-skill -->\n'; flatten; printf '\n<!-- END voltr-skill -->\n'; } >> "$dest"
  info "appended Voltr skill → $dest"
}

MDC_HEADER='---
description: Voltr — permissionless vault framework for yield strategies on Solana (vaults, adaptors, CPI, @voltr/vault-sdk).
globs:
alwaysApply: false
---'

# ---- parse args ----
targets=(); project=0; all=0; path_dir=""
while [ $# -gt 0 ]; do
  case "$1" in
    --claude|--codex|--cursor|--windsurf|--cline|--continue|--agents-md) targets+=("${1#--}") ;;
    --project) project=1 ;;
    --all) all=1 ;;
    --path) shift; [ $# -gt 0 ] || err "--path needs a directory"; path_dir="$1" ;;
    -h|--help) usage; exit 0 ;;
    *) err "unknown option: $1 (try --help)" ;;
  esac
  shift
done

if [ -n "$path_dir" ]; then
  [ ${#targets[@]} -eq 0 ] && [ "$all" -eq 0 ] || err "--path cannot combine with other targets"
  copy_folder "$path_dir"; exit 0
fi

[ "$all" -eq 1 ] && targets=(claude codex)
[ ${#targets[@]} -eq 0 ] && targets=(claude)

claude_base="$HOME/.claude"; codex_base="$CODEX_HOME"
if [ "$project" -eq 1 ]; then claude_base="./.claude"; codex_base="./.codex"; fi

echo "Installing the Voltr Dev Skill…"
for t in "${targets[@]}"; do
  case "$t" in
    claude)    copy_folder "$claude_base/skills/$SKILL_NAME" ;;
    codex)     copy_folder "$codex_base/skills/$SKILL_NAME" ;;
    cursor)    write_flat  ".cursor/rules/$SKILL_NAME.mdc" "$MDC_HEADER" ;;
    windsurf)  write_flat  ".windsurf/rules/$SKILL_NAME.md" ;;
    cline)     write_flat  ".clinerules/$SKILL_NAME.md" ;;
    continue)  write_flat  ".continue/rules/$SKILL_NAME.md" ;;
    agents-md) append_flat "AGENTS.md" ;;
  esac
done
echo "Done. In Claude Code, ask about Voltr vaults/adaptors/CPI or run /voltr."
