#!/usr/bin/env bash
set -euo pipefail

# Cursor agent shells prepend Cursor's bundled Node 20 to PATH, but this repo
# requires Node >= 22.13 (pnpm 11 uses node:sqlite). Prepend devcontainer Node
# paths so Shell tool commands resolve the correct node binary.

input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty')
if [ "$tool_name" != "Shell" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

command=$(echo "$input" | jq -r '.tool_input.command // empty')
working_directory=$(echo "$input" | jq -r '.tool_input.working_directory // empty')

if [ -z "$command" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

# Avoid double-wrapping if the agent already set PATH explicitly.
if [[ "$command" == PATH=* ]] || [[ "$command" == export\ PATH=* ]]; then
  echo '{"permission":"allow"}'
  exit 0
fi

nvm_node_bin=""
if [ -d /usr/local/share/nvm/versions/node ]; then
  nvm_node_bin=$(
    find /usr/local/share/nvm/versions/node -maxdepth 2 -type d -name bin 2>/dev/null \
      | sort -V \
      | tail -1
  )
fi

node_path="/usr/local/bin"
if [ -n "$nvm_node_bin" ]; then
  node_path="${node_path}:${nvm_node_bin}"
fi

fixed_command="export PATH=\"${node_path}:\$PATH\" && ${command}"

if [ -n "$working_directory" ]; then
  jq -n \
    --arg command "$fixed_command" \
    --arg working_directory "$working_directory" \
    '{permission: "allow", updated_input: {command: $command, working_directory: $working_directory}}'
else
  jq -n \
    --arg command "$fixed_command" \
    '{permission: "allow", updated_input: {command: $command}}'
fi
