import process from "node:process";

const TOKEN_PLACEHOLDER = "replace_with_your_tmdb_api_read_access_token";

export class ServerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigurationError";
  }
}

export function readTmdbApiReadToken(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const token = environment.TMDB_API_READ_TOKEN?.trim();

  if (
    !token ||
    token === TOKEN_PLACEHOLDER ||
    token.startsWith("Bearer ") ||
    /\s/.test(token)
  ) {
    throw new ServerConfigurationError(
      "TMDB access is not configured on the server.",
    );
  }

  return token;
}
