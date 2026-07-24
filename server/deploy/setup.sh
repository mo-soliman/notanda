#!/usr/bin/env bash
# One-time provisioning of the Oracle Ampere A1 box (Ubuntu 22.04/24.04 ARM).
# Run as a sudo-capable user from the repo's server/ directory:
#   bash deploy/setup.sh
set -euo pipefail

echo "==> apt dependencies"
sudo apt-get update
sudo apt-get install -y ffmpeg cmake build-essential git curl sqlite3

echo "==> uv (python package manager)"
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

echo "==> build transcribe.cpp (ARM NEON)"
sudo mkdir -p /opt/notanda && sudo chown "$USER" /opt/notanda
if [ ! -d /opt/notanda/transcribe.cpp ]; then
  git clone --depth 1 https://github.com/handy-computer/transcribe.cpp /opt/notanda/transcribe.cpp
fi
cmake -S /opt/notanda/transcribe.cpp -B /opt/notanda/transcribe.cpp/build -DCMAKE_BUILD_TYPE=Release
cmake --build /opt/notanda/transcribe.cpp/build -j"$(nproc)"

echo "==> download Q8_0 model (2.41 GB)"
mkdir -p /opt/notanda/models
uvx --from 'huggingface_hub[cli]' huggingface-cli download \
  handy-computer/cohere-transcribe-arabic-07-2026-gguf \
  --include '*Q8_0*.gguf' --local-dir /opt/notanda/models
echo "model files:" && ls -lh /opt/notanda/models

echo "==> python env (+ transcribe.cpp binding against the local build)"
SERVER_DIR_EARLY=$(cd "$(dirname "$0")/.." && pwd)
uv sync --project "$SERVER_DIR_EARLY"
uv pip install --project "$SERVER_DIR_EARLY" /opt/notanda/transcribe.cpp/bindings/python

echo "==> data dir + config"
sudo mkdir -p /var/lib/notanda/audio /etc/notanda
sudo chown -R "$USER" /var/lib/notanda
if [ ! -f /etc/notanda/env ]; then
  MODEL_FILE=$(ls /opt/notanda/models/*Q8_0*.gguf | head -1)
  sudo tee /etc/notanda/env >/dev/null <<EOF
NOTANDA_DATA_DIR=/var/lib/notanda
NOTANDA_ASR_BACKEND=transcribe_cpp
NOTANDA_MODEL_PATH=${MODEL_FILE}
NOTANDA_TRANSCRIBE_BIN=/opt/notanda/transcribe.cpp/build/bin/transcribe-cli
NOTANDA_TRANSCRIBE_THREADS=3
TRANSCRIBE_LIBRARY=/opt/notanda/transcribe.cpp/build
ANTHROPIC_API_KEY=CHANGE_ME
EOF
  sudo chmod 600 /etc/notanda/env
  echo "!! edit /etc/notanda/env and set ANTHROPIC_API_KEY"
fi

echo "==> open ports in local firewall (OCI images also need the VCN security list opened for 80/443!)"
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

echo "==> systemd units"
SERVER_DIR=$(cd "$(dirname "$0")/.." && pwd)
sudo sed "s|__SERVER_DIR__|${SERVER_DIR}|g; s|__USER__|${USER}|g" "$SERVER_DIR/deploy/notanda-api.service" | sudo tee /etc/systemd/system/notanda-api.service >/dev/null
sudo sed "s|__SERVER_DIR__|${SERVER_DIR}|g; s|__USER__|${USER}|g" "$SERVER_DIR/deploy/notanda-worker.service" | sudo tee /etc/systemd/system/notanda-worker.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now notanda-api notanda-worker

echo "==> nginx vhost (existing sites are untouched)"
if [ ! -f /etc/nginx/sites-available/notanda ]; then
  sudo cp "$SERVER_DIR/deploy/nginx-notanda.conf" /etc/nginx/sites-available/notanda
  sudo ln -sf /etc/nginx/sites-available/notanda /etc/nginx/sites-enabled/notanda
  sudo nginx -t && sudo systemctl reload nginx
  echo "!! once DNS points at this box: sudo certbot --nginx -d api.novari.style"
fi

echo "==> nightly sqlite backup"
( crontab -l 2>/dev/null | grep -v notanda-backup; \
  echo "15 3 * * * sqlite3 /var/lib/notanda/notanda.db \".backup /var/lib/notanda/notanda-backup.db\" # notanda-backup" ) | crontab -

echo "==> done. Create an API key with:"
echo "    cd $SERVER_DIR && uv run python -m notanda_server.keys create <label>"
