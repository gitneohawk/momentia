const DEFAULT_HOSTS = ["www.momentia.photo", "momentia.photo"];

function addHostVariants(target: Set<string>, value: string | null | undefined) {
  if (!value) return;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return;

  const candidates = new Set<string>();
  candidates.add(trimmed);

  const [hostOnly, port] = trimmed.split(":");
  if (hostOnly && hostOnly.length > 0) {
    candidates.add(hostOnly);

    if (hostOnly.startsWith("www.")) {
      const withoutWww = hostOnly.slice(4);
      if (withoutWww) {
        candidates.add(withoutWww);
        if (port) {
          candidates.add(`${withoutWww}:${port}`);
        }
      }
    } else {
      candidates.add(`www.${hostOnly}`);
      if (port) {
        candidates.add(`${hostOnly}:${port}`);
        candidates.add(`www.${hostOnly}:${port}`);
      }
    }
  }

  for (const c of candidates) {
    target.add(c);
  }
}

export function createAllowedHosts(extra: string[] = []): Set<string> {
  const set = new Set<string>();

  for (const host of [...DEFAULT_HOSTS, ...extra]) {
    addHostVariants(set, host);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    try {
      const h = new URL(baseUrl).host;
      addHostVariants(set, h);
    } catch {
      // ignore invalid URL
    }
  }

  const adminHostsEnv = process.env.ADMIN_ALLOWED_HOSTS;
  if (adminHostsEnv) {
    for (const host of adminHostsEnv.split(",")) {
      addHostVariants(set, host);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    addHostVariants(set, "localhost");
    addHostVariants(set, "localhost:3000");
    addHostVariants(set, "127.0.0.1");
  }

  return set;
}
