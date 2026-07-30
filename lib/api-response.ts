const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export class InvalidJsonError extends Error {
  constructor() {
    super("Invalid JSON request body");
    this.name = "InvalidJsonError";
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new InvalidJsonError();
  }
}

export function noStoreJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return Response.json(data, {
    ...init,
    headers,
  });
}

export function apiErrorResponse(error: unknown, fallback: string) {
  if (error instanceof InvalidJsonError) {
    return noStoreJson({ error: "El cuerpo de la solicitud no contiene JSON válido." }, { status: 400 });
  }
  return noStoreJson({ error: fallback }, { status: 500 });
}
