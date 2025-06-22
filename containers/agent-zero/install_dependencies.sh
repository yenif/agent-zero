#!/bin/bash
set -e

echo 'Installing additional system dependencies...'

# Update package list
apt-get update -y

# Install git, gh (GitHub CLI), and kubectl
echo 'Installing git, gh, kubectl...'
apt-get install -y git kubectl

# Install GitHub CLI
if ! command -v gh &> /dev/null; then
    echo 'Installing GitHub CLI...'
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update
    apt-get install -y gh
else
    echo 'GitHub CLI already installed.'
fi

# Install sops for secrets management
if ! command -v sops &> /dev/null; then
    echo 'Installing sops...'
    SOPS_VERSION='v3.8.1'
    SOPS_URL="https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.amd64"
    wget -q $SOPS_URL -O /usr/local/bin/sops
    chmod +x /usr/local/bin/sops
    echo 'sops installed successfully.'
else
    echo 'sops already installed.'
fi

echo 'System dependencies installation complete.'
