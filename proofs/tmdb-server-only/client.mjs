import process from "node:process";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TOKEN_PLACEHOLDER = "replace_with_your_tmdb_api_read_access_token";

export const DEFAULT_TIMEOUT_MS = 5_000;

export class TmdbProofError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = "TmdbProofError";
    this.code = code;
    this.status = status;
  }
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function validateToken(token) {
  if (typeof token !== "string") {
    throw new TmdbProofError(
      "TMDB access is not configured on the server.",
      { code: "CONFIGURATION_ERROR" },
    );
  }

  const normalizedToken = token.trim();

  if (
    normalizedToken === "" ||
    normalizedToken === TOKEN_PLACEHOLDER ||
    normalizedToken.startsWith("Bearer ") ||
    /\s/.test(normalizedToken)
  ) {
    throw new TmdbProofError(
      "TMDB access is not configured on the server.",
      { code: "CONFIGURATION_ERROR" },
    );
  }

  return normalizedToken;
}

export function normalizeMovie(movie) {
  if (
    movie === null ||
    typeof movie !== "object" ||
    !Number.isInteger(movie.id) ||
    movie.id <= 0 ||
    textOrNull(movie.title) === null
  ) {
    throw new TmdbProofError(
      "TMDB returned a movie result that PickTonight could not use.",
      { code: "INVALID_RESPONSE" },
    );
  }

  return {
    source: "tmdb",
    mediaType: "movie",
    id: movie.id,
    title: textOrNull(movie.title),
    originalTitle: textOrNull(movie.original_title),
    overview: textOrNull(movie.overview),
    releaseDate: textOrNull(movie.release_date),
    originalLanguage: textOrNull(movie.original_language),
    genreIds: Array.isArray(movie.genre_ids)
      ? movie.genre_ids.filter((genreId) => Number.isInteger(genreId))
      : [],
    posterPath: textOrNull(movie.poster_path),
    backdropPath: textOrNull(movie.backdrop_path),
    popularity: finiteNumberOrNull(movie.popularity),
    voteAverage: finiteNumberOrNull(movie.vote_average),
    voteCount: integerOrNull(movie.vote_count),
    adult: typeof movie.adult === "boolean" ? movie.adult : null,
  };
}

export async function fetchPopularMovie({
  token = process.env.TMDB_API_READ_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  language = "en-US",
  region = "US",
} = {}) {
  const normalizedToken = validateToken(token);

  if (typeof fetchImpl !== "function") {
    throw new TmdbProofError(
      "The server runtime does not provide an HTTP client.",
      { code: "CONFIGURATION_ERROR" },
    );
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TmdbProofError(
      "The TMDB request timeout is not configured correctly.",
      { code: "CONFIGURATION_ERROR" },
    );
  }

  const requestUrl = new URL(`${TMDB_API_BASE_URL}/movie/popular`);
  requestUrl.searchParams.set("language", language);
  requestUrl.searchParams.set("page", "1");
  requestUrl.searchParams.set("region", region);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizedToken}`,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new TmdbProofError(
        "TMDB authentication failed. Check the server-only API Read Access Token.",
        { code: "AUTHENTICATION_ERROR", status: response.status },
      );
    }

    if (!response.ok) {
      throw new TmdbProofError(
        "TMDB is temporarily unavailable. Try again shortly.",
        { code: "UPSTREAM_ERROR", status: response.status },
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new TmdbProofError(
        "TMDB returned a response that PickTonight could not read.",
        { code: "INVALID_RESPONSE", status: response.status },
      );
    }

    if (!payload || !Array.isArray(payload.results)) {
      throw new TmdbProofError(
        "TMDB returned a response that PickTonight could not read.",
        { code: "INVALID_RESPONSE", status: response.status },
      );
    }

    if (payload.results.length === 0) {
      throw new TmdbProofError(
        "TMDB returned no movie results for this proof request.",
        { code: "NO_RESULTS", status: response.status },
      );
    }

    return normalizeMovie(payload.results[0]);
  } catch (error) {
    if (error instanceof TmdbProofError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new TmdbProofError(
        "TMDB took too long to respond. Try again.",
        { code: "UPSTREAM_TIMEOUT" },
      );
    }

    throw new TmdbProofError(
      "PickTonight could not reach TMDB. Check the connection and try again.",
      { code: "NETWORK_ERROR" },
    );
  } finally {
    clearTimeout(timeout);
  }
}
