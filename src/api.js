import { Buffer } from 'buffer';

export async function generateImage(host, port, payload, timeoutMs) {
  const url = `http://${host}:${port}/sdapi/v1/txt2img`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (!data.images || !Array.isArray(data.images)) {
      throw new Error('Unexpected API response: missing "images" array');
    }

    return data.images.map((base64) => Buffer.from(base64, 'base64'));
  } finally {
    clearTimeout(timeout);
  }
}
