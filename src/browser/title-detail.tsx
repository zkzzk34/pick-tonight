import { useId, useState } from "react";

import {
  formatRuntime,
  ratingConfidenceLabels,
  safeHttpsUrl,
} from "./recommendation-card-model";
import {
  hasProviderAvailability,
  type TitleDetailAction,
  type TitleDetailData,
  type TitleDetailProviderAvailability,
  type TitleDetailReasonKind,
} from "./title-detail-model";

interface TitleDetailProps {
  readonly detail: TitleDetailData;
  readonly isChosenTonight: boolean;
  readonly isSaved?: boolean;
  readonly onAction: (
    action: TitleDetailAction,
    detail: TitleDetailData,
  ) => void;
  readonly onBack: () => void;
  readonly onReplace: (detail: TitleDetailData) => void;
  readonly onTrailerClick?: (detail: TitleDetailData) => void;
}

const actions = [
  { action: "choose-tonight", label: "Choose tonight" },
  { action: "save", label: "Save" },
  { action: "more-like-this", label: "More like this" },
  { action: "not-tonight", label: "Not tonight" },
  { action: "not-my-taste", label: "Not my taste" },
  { action: "already-watched", label: "Already watched" },
] as const satisfies readonly {
  readonly action: TitleDetailAction;
  readonly label: string;
}[];

const reasonKindLabels: Readonly<Record<TitleDetailReasonKind, string>> = {
  verified: "Verified restriction",
  "soft-match": "Preference match",
  neutral: "Neutral context",
};

interface ProviderGroupProps {
  readonly label: string;
  readonly providers: readonly string[];
}

function ProviderGroup({ label, providers }: ProviderGroupProps) {
  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="title-detail__provider-group">
      <dt>{label}</dt>
      <dd>{providers.join(", ")}</dd>
    </div>
  );
}

function ProviderAvailability({
  availability,
  watchRegion,
}: {
  readonly availability: TitleDetailProviderAvailability | null;
  readonly watchRegion: string;
}) {
  if (availability === null || !hasProviderAvailability(availability)) {
    return (
      <p className="title-detail__missing">
        Provider availability unknown for {watchRegion}.
      </p>
    );
  }

  const tmdbUrl = safeHttpsUrl(availability.tmdbUrl);

  return (
    <div className="title-detail__providers">
      <p>
        Availability shown for <strong>{availability.watchRegion}</strong>.
      </p>

      <dl>
        <ProviderGroup label="Streaming" providers={availability.streaming} />
        <ProviderGroup label="Free" providers={availability.free} />
        <ProviderGroup label="With ads" providers={availability.ads} />
        <ProviderGroup label="Rent" providers={availability.rent} />
        <ProviderGroup label="Buy" providers={availability.buy} />
      </dl>

      <p className="title-detail__provider-attribution">
        Availability data:{" "}
        <a href="https://www.justwatch.com/" rel="noreferrer" target="_blank">
          JustWatch
        </a>
        .
      </p>

      {tmdbUrl === null ? null : (
        <a
          className="title-detail__provider-link"
          href={tmdbUrl}
          rel="noreferrer"
          target="_blank"
        >
          View availability on TMDB
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

function DetailPoster({
  posterUrl,
  title,
}: Pick<TitleDetailData, "posterUrl" | "title">) {
  const [imageFailed, setImageFailed] = useState(false);
  const safePosterUrl = safeHttpsUrl(posterUrl);

  if (safePosterUrl === null || imageFailed) {
    return (
      <div
        aria-label={`Poster unavailable for ${title}`}
        className="title-detail__poster-placeholder"
        role="img"
      >
        <span aria-hidden="true">PT</span>
        <strong>{title}</strong>
        <span>Poster unavailable</span>
      </div>
    );
  }

  return (
    <img
      alt={`Poster for ${title}`}
      className="title-detail__poster"
      onError={() => setImageFailed(true)}
      src={safePosterUrl}
    />
  );
}

export function TitleDetail({
  detail,
  isChosenTonight,
  isSaved = false,
  onAction,
  onBack,
  onReplace,
  onTrailerClick,
}: TitleDetailProps) {
  const headingId = useId();
  const runtime = formatRuntime(detail.runtime);
  const trailerUrl = safeHttpsUrl(detail.trailerUrl);
  const genres = detail.genres
    .map((genre) => genre.trim())
    .filter((genre) => genre !== "");

  return (
    <section
      aria-label={`Title details for ${detail.title}`}
      className="title-detail"
    >
      <button className="title-detail__back" onClick={onBack} type="button">
        <span aria-hidden="true">← </span>
        Back to 3 picks
      </button>

      <div className="title-detail__layout">
        <div className="title-detail__artwork">
          <DetailPoster posterUrl={detail.posterUrl} title={detail.title} />
        </div>

        <article aria-labelledby={headingId} className="title-detail__content">
          <header className="title-detail__header">
            <p className="eyebrow">Title details</p>
            <h2 id={headingId}>{detail.title}</h2>
            <p className="title-detail__identity">
              <span>{detail.year ?? "Year unavailable"}</span>
              <span aria-hidden="true"> · </span>
              <span>
                {detail.mediaType === "movie" ? "Movie" : "Television"}
              </span>
            </p>
          </header>

          <section aria-labelledby={`${headingId}-overview`}>
            <h3 id={`${headingId}-overview`}>Overview</h3>
            <p>{detail.overview?.trim() || "Overview unavailable."}</p>
          </section>

          <section aria-labelledby={`${headingId}-genres`}>
            <h3 id={`${headingId}-genres`}>Genres</h3>
            {genres.length === 0 ? (
              <p className="title-detail__missing">
                Genre information unavailable.
              </p>
            ) : (
              <ul
                aria-label={`Genres for ${detail.title}`}
                className="title-detail__genres"
              >
                {genres.map((genre) => (
                  <li key={genre}>{genre}</li>
                ))}
              </ul>
            )}
          </section>

          <dl className="title-detail__facts">
            <div>
              <dt>
                {detail.mediaType === "tv" ? "Episode length" : "Runtime"}
              </dt>
              <dd>{runtime ?? "Runtime unavailable."}</dd>
            </div>

            <div>
              <dt>Rating</dt>
              <dd>
                {detail.rating === null ? (
                  "Rating unavailable."
                ) : detail.rating.confidence === "none" ? (
                  <>
                    <span>Rating not established.</span>
                    <small>{ratingConfidenceLabels.none}</small>
                  </>
                ) : (
                  <>
                    <span>
                      {detail.rating.average.toFixed(1)}/10
                      {detail.rating.voteCount === null
                        ? ""
                        : ` · ${detail.rating.voteCount.toLocaleString(
                            "en-US",
                          )} votes`}
                    </span>
                    <small>
                      {ratingConfidenceLabels[detail.rating.confidence]}
                    </small>
                  </>
                )}
              </dd>
            </div>

            <div>
              <dt>Freshness</dt>
              <dd>
                {detail.freshness?.label.trim() ||
                  "Freshness information unavailable."}
              </dd>
            </div>
          </dl>

          <section aria-labelledby={`${headingId}-watch`}>
            <h3 id={`${headingId}-watch`}>Where to watch</h3>
            <ProviderAvailability
              availability={detail.providerAvailability}
              watchRegion={detail.watchRegion}
            />
          </section>

          <section
            aria-labelledby={`${headingId}-explanation`}
            className="title-detail__fit"
          >
            <h3 id={`${headingId}-explanation`}>Why this fits</h3>

            {detail.fitExplanation === null ? (
              <p>Fit explanation unavailable.</p>
            ) : (
              <>
                <p className="title-detail__fit-summary">
                  {detail.fitExplanation.summary}
                </p>
                <ul>
                  {detail.fitExplanation.reasons.map((reason, index) => (
                    <li key={`${reason.kind}-${reason.label}-${index}`}>
                      <span>{reasonKindLabels[reason.kind]}</span>
                      <strong>{reason.label}</strong>
                      <p>{reason.text}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-labelledby={`${headingId}-trailer`}>
            <h3 id={`${headingId}-trailer`}>Trailer</h3>
            {trailerUrl === null ? (
              <p className="title-detail__missing">Trailer unavailable.</p>
            ) : (
              <a
                className="title-detail__trailer"
                href={trailerUrl}
                onClick={() => onTrailerClick?.(detail)}
                rel="noreferrer"
                target="_blank"
              >
                Watch trailer for {detail.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </section>

          <section
            aria-labelledby={`${headingId}-actions`}
            className="title-detail__decision"
          >
            <div>
              <h3 id={`${headingId}-actions`}>What do you want to do?</h3>
              <p>
                Choose tonight records watch intent for this active session. It
                does not mark the title as watched.
              </p>
            </div>

            {isChosenTonight ? (
              <p className="title-detail__watch-intent" role="status">
                Watch intent set for this title.
              </p>
            ) : null}

            <div className="title-detail__actions">
              {actions.map(({ action, label }) => {
                const saveAlreadyExists = action === "save" && isSaved;

                return (
                  <button
                    aria-disabled={saveAlreadyExists || undefined}
                    aria-label={`${label}: ${detail.title}`}
                    aria-pressed={
                      action === "choose-tonight"
                        ? isChosenTonight
                        : action === "save"
                          ? isSaved
                          : undefined
                    }
                    key={action}
                    onClick={() => {
                      if (!saveAlreadyExists) {
                        onAction(action, detail);
                      }
                    }}
                    type="button"
                  >
                    {saveAlreadyExists ? "Saved" : label}
                  </button>
                );
              })}

              <button
                aria-label={`Replace: ${detail.title}`}
                onClick={() => onReplace(detail)}
                type="button"
              >
                Replace
              </button>
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}
