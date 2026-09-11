import { useEffect, useId, useRef, useState, type RefCallback } from "react";

import {
  formatRuntime,
  ratingConfidenceLabels,
  RECOMMENDATION_CARD_COUNT,
  safeHttpsUrl,
  type RecommendationCardAction,
  type RecommendationCardData,
  type RecommendationCardSet,
} from "./recommendation-card-model";

export interface RecommendationCardsProps {
  readonly recommendations: RecommendationCardSet;
  readonly onAction: (
    action: RecommendationCardAction,
    recommendation: RecommendationCardData,
  ) => void;
  readonly onReplace: (
    recommendation: RecommendationCardData,
    index: number,
  ) => void;
}

const directActions = [
  { action: "choose-tonight", label: "Choose tonight" },
  { action: "details", label: "Details" },
  { action: "save", label: "Save" },
] as const satisfies readonly {
  readonly action: RecommendationCardAction;
  readonly label: string;
}[];

const additionalActions = [
  { action: "more-like-this", label: "More like this" },
  { action: "not-tonight", label: "Not tonight" },
  { action: "not-my-taste", label: "Not my taste" },
  { action: "already-watched", label: "Already watched" },
] as const satisfies readonly {
  readonly action: RecommendationCardAction;
  readonly label: string;
}[];

function RecommendationPoster({
  title,
  posterUrl,
}: Pick<RecommendationCardData, "title" | "posterUrl">) {
  const [imageFailed, setImageFailed] = useState(false);
  const safePosterUrl = safeHttpsUrl(posterUrl);

  if (safePosterUrl === null || imageFailed) {
    return (
      <div
        aria-label={`Poster unavailable for ${title}`}
        className="recommendation-card__poster-placeholder"
        role="img"
      >
        <span aria-hidden="true">PT</span>
        <span>Poster unavailable</span>
      </div>
    );
  }

  return (
    <img
      alt={`Poster for ${title}`}
      className="recommendation-card__poster"
      loading="lazy"
      onError={() => setImageFailed(true)}
      src={safePosterUrl}
    />
  );
}

interface RecommendationCardProps {
  readonly cardRef: RefCallback<HTMLElement>;
  readonly recommendation: RecommendationCardData;
  readonly position: number;
  readonly onAction: RecommendationCardsProps["onAction"];
  readonly onReplace: RecommendationCardsProps["onReplace"];
}

function RecommendationCard({
  cardRef,
  recommendation,
  position,
  onAction,
  onReplace,
}: RecommendationCardProps) {
  const headingId = useId();
  const moreActionsId = useId();
  const [showMoreActions, setShowMoreActions] = useState(false);
  const runtime = formatRuntime(recommendation.runtime);
  const trailerUrl = safeHttpsUrl(recommendation.trailerUrl);
  const genres = recommendation.genres
    .map((genre) => genre.trim())
    .filter((genre) => genre !== "");
  const providerRegion =
    recommendation.providerAvailability?.watchRegion.trim() ?? "";
  const providerNames =
    recommendation.providerAvailability?.providerNames
      .map((providerName) => providerName.trim())
      .filter((providerName) => providerName !== "") ?? [];

  return (
    <article
      aria-labelledby={headingId}
      className="recommendation-card"
      ref={cardRef}
      tabIndex={-1}
    >
      <RecommendationPoster
        posterUrl={recommendation.posterUrl}
        title={recommendation.title}
      />

      <div className="recommendation-card__body">
        <p className="recommendation-card__position">Pick {position}</p>
        <h3 id={headingId}>{recommendation.title}</h3>
        <p className="recommendation-card__identity">
          <span>{recommendation.year ?? "Year unavailable"}</span>
          <span aria-hidden="true"> · </span>
          <span>
            {recommendation.mediaType === "movie" ? "Movie" : "Television"}
          </span>
        </p>

        <p className="recommendation-card__overview">
          {recommendation.overview?.trim() || "Overview unavailable."}
        </p>

        <div className="recommendation-card__genres">
          <h4>Genres</h4>
          {genres.length > 0 ? (
            <ul aria-label={`Genres for ${recommendation.title}`}>
              {genres.map((genre) => (
                <li key={genre}>{genre}</li>
              ))}
            </ul>
          ) : (
            <p>Genre information unavailable.</p>
          )}
        </div>

        <dl className="recommendation-card__facts">
          <div>
            <dt>Runtime</dt>
            <dd>{runtime ?? "Runtime unavailable."}</dd>
          </div>
          <div>
            <dt>Rating</dt>
            <dd>
              {recommendation.rating === null ? (
                "Rating unavailable."
              ) : recommendation.rating.confidence === "none" ? (
                <>
                  <span>Rating not established.</span>
                  <small>{ratingConfidenceLabels.none}</small>
                </>
              ) : (
                <>
                  <span>
                    {recommendation.rating.average.toFixed(1)}/10
                    {recommendation.rating.voteCount === null
                      ? ""
                      : ` · ${recommendation.rating.voteCount.toLocaleString(
                          "en-US",
                        )} votes`}
                  </span>
                  <small>
                    {ratingConfidenceLabels[recommendation.rating.confidence]}
                  </small>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Freshness</dt>
            <dd>
              {recommendation.freshness?.label.trim() ||
                "Freshness information unavailable."}
            </dd>
          </div>
          <div>
            <dt>Where to watch</dt>
            <dd>
              {recommendation.providerAvailability !== null &&
              providerRegion !== "" &&
              providerNames.length > 0 ? (
                <>
                  <span>
                    {providerNames.join(", ")} · {providerRegion}
                  </span>
                  <small>
                    Availability data:{" "}
                    <a href="https://www.justwatch.com/">JustWatch</a>
                  </small>
                </>
              ) : (
                "Provider availability unavailable."
              )}
            </dd>
          </div>
        </dl>

        <div className="recommendation-card__fit">
          <h4>Why it fits</h4>
          <p>
            {recommendation.fitExplanation?.text.trim() ||
              "Fit explanation unavailable."}
          </p>
        </div>

        <div className="recommendation-card__links">
          {trailerUrl === null ? (
            <span>Trailer unavailable.</span>
          ) : (
            <a href={trailerUrl}>Watch trailer for {recommendation.title}</a>
          )}
        </div>

        <div className="recommendation-card__actions">
          {directActions.map(({ action, label }) => (
            <button
              aria-label={`${label}: ${recommendation.title}`}
              key={action}
              onClick={() => onAction(action, recommendation)}
              type="button"
            >
              {label}
            </button>
          ))}
          <button
            aria-label={`Replace: ${recommendation.title}`}
            onClick={() => onReplace(recommendation, position - 1)}
            type="button"
          >
            Replace
          </button>
          <button
            aria-controls={moreActionsId}
            aria-expanded={showMoreActions}
            aria-label={`${showMoreActions ? "Hide more actions" : "More actions"}: ${recommendation.title}`}
            onClick={() => setShowMoreActions((isOpen) => !isOpen)}
            type="button"
          >
            More actions
          </button>
        </div>

        {showMoreActions ? (
          <div className="recommendation-card__more-actions" id={moreActionsId}>
            {additionalActions.map(({ action, label }) => (
              <button
                aria-label={`${label}: ${recommendation.title}`}
                key={action}
                onClick={() => onAction(action, recommendation)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function RecommendationCards({
  recommendations,
  onAction,
  onReplace,
}: RecommendationCardsProps) {
  const headingId = useId();
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const previousMediaKeys = useRef(
    recommendations.map(({ mediaKey }) => mediaKey),
  );

  useEffect(() => {
    const currentMediaKeys = recommendations.map(({ mediaKey }) => mediaKey);
    const changedIndex = currentMediaKeys.findIndex(
      (mediaKey, index) => mediaKey !== previousMediaKeys.current[index],
    );

    previousMediaKeys.current = currentMediaKeys;

    if (changedIndex !== -1) {
      cardRefs.current[changedIndex]?.focus();
    }
  }, [recommendations]);

  return (
    <section aria-labelledby={headingId} className="recommendation-results">
      <h2 id={headingId}>{RECOMMENDATION_CARD_COUNT} picks for tonight</h2>
      <ol aria-label="Recommendations" className="recommendation-results__list">
        {recommendations.map((recommendation, index) => (
          <li key={recommendation.mediaKey}>
            <RecommendationCard
              cardRef={(node) => {
                cardRefs.current[index] = node;
              }}
              onAction={onAction}
              onReplace={onReplace}
              position={index + 1}
              recommendation={recommendation}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
