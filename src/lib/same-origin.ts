// Refusing requests from other sites to the coordinator's POST routes.

/** A request from a page on this app, or with no Origin at all. An Origin that is not a URL, such as "null", is refused. */
export function fromThisApp(origin: string | null, host: string | null) {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
