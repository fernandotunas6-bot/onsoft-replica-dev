/// R2 object keys are stored in D1; served at GET /media/{key} on the worker.
String? profilePhotoUrlFromKey(String? key, String apiBaseUrl) {
  if (key == null || key.isEmpty) return null;
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  final base = apiBaseUrl.endsWith('/') ? apiBaseUrl.substring(0, apiBaseUrl.length - 1) : apiBaseUrl;
  return '$base/media/${Uri.encodeComponent(key).replaceAll('%2F', '/')}';
}

/// Uses the same default base as [dioProvider] (compile-time const).
String kDefaultApiBaseUrl() {
  return const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://school-worker.ceo-6f0.workers.dev',
  );
}
