# syntax=docker/dockerfile:1
# Builds transcribe.cpp, then ships its CLI + libs with the Python app. ASR runs
# as a subprocess (see asr.py) so transcribe's ggml can't collide with the copy
# bundled inside pysilero-vad.
# The GGUF model is NOT baked in — it is bind-mounted at /models (see compose).

FROM python:3.12-slim-trixie AS builder
ARG TRANSCRIBE_REF=main
RUN apt-get update && apt-get install -y --no-install-recommends \
      git cmake build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${TRANSCRIBE_REF}" \
      https://github.com/handy-computer/transcribe.cpp /src/transcribe.cpp
WORKDIR /src/transcribe.cpp
RUN cmake -B build-shared -DTRANSCRIBE_BUILD_SHARED=ON -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build-shared --target transcribe transcribe-cli -j"$(nproc)"
# libtranscribe.so links against the ggml backend libs, so ship the whole set.
RUN mkdir -p /out/lib \
 && find build-shared -name '*.so*' -exec cp -a {} /out/lib/ \; \
 && cp build-shared/bin/transcribe-cli /out/


FROM python:3.12-slim-trixie
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/lib/ /usr/local/lib/
COPY --from=builder /out/transcribe-cli /usr/local/bin/transcribe-cli
RUN ldconfig

COPY --from=ghcr.io/astral-sh/uv:0.11.12 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
ENV PATH="/app/.venv/bin:$PATH"

COPY notanda_server ./notanda_server
COPY deploy ./deploy

ENV NOTANDA_DATA_DIR=/data \
    NOTANDA_MODEL_PATH=/models/model.gguf \
    PYTHONUNBUFFERED=1
CMD ["uvicorn", "notanda_server.api:app", "--host", "0.0.0.0", "--port", "8000"]
