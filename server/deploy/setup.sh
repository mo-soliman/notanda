#!/usr/bin/env bash
# Host-level provisioning only — the backend itself runs in Docker (see
# docker-compose.yml at the repo root). This script handles the things that
# can't live in a container: Docker itself, the GGUF model on the host disk,
# the firewall, and the nginx vhost that terminates TLS.
#
#   bash server/deploy/setup.sh
set -euo pipefail

REPO_DIR=$(cd "$(dirname "$0")/../.." && pwd)
MODEL_DIR=${NOTANDA_MODEL_DIR:-/opt/notanda/models}
DOMAIN=${NOTANDA_DOMAIN:-api.novari.style}

echo "==> docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "!! log out and back in for docker group membership to take effect"
fi

echo "==> GGUF model (2.41 GB, skipped if already present)"
sudo mkdir -p "$MODEL_DIR" && sudo chown "$USER" "$MODEL_DIR"
if ! ls "$MODEL_DIR"/*Q8_0*.gguf >/dev/null 2>&1; then
  # NOTE: `huggingface-cli` is gone in current huggingface_hub — the CLI is `hf`.
  uvx --from 'huggingface_hub[cli]' hf download \
    handy-computer/cohere-transcribe-arabic-07-2026-gguf \
    --include '*Q8_0*.gguf' --local-dir "$MODEL_DIR"
fi
ls -lh "$MODEL_DIR"/*.gguf

echo "==> .env"
if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  MODEL_FILE=$(basename "$(ls "$MODEL_DIR"/*Q8_0*.gguf | head -1)")
  sed -i "s|^NOTANDA_MODEL_PATH=.*|NOTANDA_MODEL_PATH=/models/${MODEL_FILE}|" "$REPO_DIR/.env"
  sed -i "s|^NOTANDA_MODEL_DIR=.*|NOTANDA_MODEL_DIR=${MODEL_DIR}|" "$REPO_DIR/.env"
  echo "!! set ANTHROPIC_API_KEY in $REPO_DIR/.env (summaries fail without it)"
fi

echo "==> firewall (OCI images filter locally AND in the VCN security list)"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -p tcp --dport $port -j ACCEPT
done
sudo netfilter-persistent save 2>/dev/null || true

echo "==> nginx vhost for ${DOMAIN} (other sites on this box are untouched)"
if [ ! -f /etc/nginx/sites-available/notanda ]; then
  sudo sed "s|api.novari.style|${DOMAIN}|g" "$REPO_DIR/server/deploy/nginx-notanda.conf" \
    | sudo tee /etc/nginx/sites-available/notanda >/dev/null
  sudo ln -sf /etc/nginx/sites-available/notanda /etc/nginx/sites-enabled/notanda
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "==> starting containers"
cd "$REPO_DIR"
docker compose up -d --build

cat <<EOF

==> done. Next:
  1. Point a DNS A record for ${DOMAIN} at this box, then:
       sudo certbot --nginx -d ${DOMAIN}
  2. Create an API key for the desktop app:
       docker compose exec api python -m notanda_server.keys create <label>
  3. Logs:  docker compose logs -f worker
EOF
