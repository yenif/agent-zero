#!/bin/bash

# Enhanced run script that preserves environment from parent process
# This addresses the issue of blanking out shell environment

echo "Starting A0 with environment preservation..."

# Source environment preservation first
if [ -f "/etc/profile.d/preserve-env.sh" ]; then
    source "/etc/profile.d/preserve-env.sh"
fi

# Source any existing agent environment
if [ -f "/root/agent_env.sh" ]; then
    source "/root/agent_env.sh"
fi

# Set up virtual environment (preserving existing environment)
. "/ins/setup_venv.sh" "$@"

# Copy A0 files
. "/ins/copy_A0.sh" "$@"

# Run preparation scripts
python /a0/prepare.py --dockerized=true
python /a0/preload.py --dockerized=true

echo "Starting A0 with preserved environment..."

# Start A0 with all environment variables preserved
exec env - \
    PATH="$PATH" \
    HOME="$HOME" \
    USER="$USER" \
    SHELL="$SHELL" \
    TERM="$TERM" \
    LANG="$LANG" \
    LC_ALL="$LC_ALL" \
    PYTHONPATH="$PYTHONPATH" \
    VIRTUAL_ENV="$VIRTUAL_ENV" \
    GITHUB_TOKEN="${GITHUB_TOKEN:-$GITHUB_TOKEN_PRESERVED}" \
    $(env | grep '^KUBERNETES_' | sed 's/=.*//' | while read var; do echo "$var=${!var}"; done | tr '\n' ' ') \
    python /a0/run_ui.py \
        --dockerized=true \
        --port=80 \
        --host="0.0.0.0" \
        --code_exec_docker_enabled=false \
        --code_exec_ssh_enabled=true
