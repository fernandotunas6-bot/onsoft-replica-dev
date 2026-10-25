function workerBaseUrlForMedia() {
  return (
    process.env.NEXT_PUBLIC_WORKER_API_URL ??
    process.env.WORKER_API_URL ??
    'http://127.0.0.1:8787'
  ).replace(/\/$/, '');
}

export function getMediaUrl(key: string) {
  const baseUrl = workerBaseUrlForMedia();
  return `${baseUrl}/media/${key}`;
}
