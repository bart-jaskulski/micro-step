const PAIR_ROUTE = "/pair";

export const buildPairingHash = (vaultKey: string): string => {
  return `#vault=${encodeURIComponent(vaultKey)}`;
};

export const buildPairingUrl = (origin: string, vaultKey: string): string => {
  const pairUrl = new URL(PAIR_ROUTE, origin);
  return `${pairUrl.toString()}${buildPairingHash(vaultKey)}`;
};

export const parseVaultKeyFromHash = (hash: string): string | null => {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!fragment) {
    return null;
  }

  const params = new URLSearchParams(fragment);
  const vaultKey = params.get("vault");

  return vaultKey && vaultKey.length > 0 ? vaultKey : null;
};

export const clearPairingHash = (): void => {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
};
