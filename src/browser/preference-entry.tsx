import { useMemo, useRef, useState } from "react";

import { requestConfiguredRecommendations } from "./recommendation-requester";
import {
  COMPANION_OPTIONS,
  LANGUAGE_OPTIONS,
  MEDIA_OPTIONS,
  MOOD_OPTIONS,
  ORIGIN_OPTIONS,
  PROVIDER_OPTIONS,
  TIME_OPTIONS,
  WATCH_REGION_OPTIONS,
  createDefaultPreferenceDraft,
  getCompanionLabel,
  getCountryLabel,
  getGenreLabel,
  getGenreOptions,
  getLanguageLabel,
  getMediaLabel,
  getMoodLabel,
  getProviderLabel,
  getQuickGenreOptions,
  interpretPreferences,
  type PreferenceDraft,
  type PreferenceInterpretation,
  type PreferenceMediaType,
} from "./preference-entry-model";
import { FeedbackRecommendationExperience } from "./feedback-recommendation-experience";
import { RecommendationRequestPanel } from "./recommendation-request-panel";
import type { SaveToWatchlist } from "./local-watchlist";
import type { ContextSummaryProperties } from "./analytics-events";
import {
  trackPickerStarted,
  trackPickerStepCompleted,
} from "./analytics-tracker";

interface ReviewRowProps {
  label: string;
  value: string;
  removeKey?: string;
  onRemove: (key: string) => void;
  note?: string;
}

function ReviewRow({
  label,
  value,
  removeKey,
  onRemove,
  note,
}: ReviewRowProps) {
  return (
    <li className="preference-review__row">
      <div>
        <span className="preference-review__row-label">{label}</span>
        <strong>{value}</strong>
        {note ? <small>{note}</small> : null}
      </div>
      {removeKey ? (
        <button
          aria-label={`Remove ${label}: ${value}`}
          onClick={() => onRemove(removeKey)}
          type="button"
        >
          Remove
        </button>
      ) : null}
    </li>
  );
}

function clearSuppression(
  suppressedKeys: readonly string[],
  keys: readonly string[],
): string[] {
  const removing = new Set(keys);
  return suppressedKeys.filter((key) => !removing.has(key));
}

function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function removePreferenceFromDraft(
  draft: PreferenceDraft,
  key: string,
): PreferenceDraft {
  const suppressedKeys = [...new Set([...draft.suppressedKeys, key])];

  if (key === "hard.mediaType") {
    return { ...draft, mediaType: null, suppressedKeys };
  }

  if (key === "hard.runtime") {
    return {
      ...draft,
      maximumRuntimeMinutes: null,
      suppressedKeys,
    };
  }

  if (key === "soft.mood") {
    return { ...draft, mood: null, suppressedKeys };
  }

  if (key === "soft.companion") {
    return { ...draft, companion: null, suppressedKeys };
  }

  if (key === "soft.freshness") {
    return { ...draft, freshnessYear: null, suppressedKeys };
  }

  if (key === "soft.language") {
    return { ...draft, contentLanguage: null, suppressedKeys };
  }

  if (key === "soft.origin") {
    return { ...draft, originCountry: null, suppressedKeys };
  }

  if (key.startsWith("preferredGenre.")) {
    const genreKey = key.slice("preferredGenre.".length);
    return {
      ...draft,
      preferredGenreKeys: draft.preferredGenreKeys.filter(
        (candidate) => candidate !== genreKey,
      ),
      suppressedKeys,
    };
  }

  if (key.startsWith("excludedGenre.")) {
    const genreKey = key.slice("excludedGenre.".length);
    return {
      ...draft,
      excludedGenreKeys: draft.excludedGenreKeys.filter(
        (candidate) => candidate !== genreKey,
      ),
      suppressedKeys,
    };
  }

  if (key.startsWith("hard.provider.")) {
    const providerId = Number(key.slice("hard.provider.".length));
    return {
      ...draft,
      requiredProviderIds: draft.requiredProviderIds.filter(
        (candidate) => candidate !== providerId,
      ),
      suppressedKeys,
    };
  }

  return { ...draft, suppressedKeys };
}

interface PreferenceEntryFlowProps {
  readonly analyticsPickerAttemptKey?: number;
  readonly analyticsSessionId?: string | null;
  readonly onContextSubmitted?: () => void;
  readonly onPickerStarted?: () => void;
  readonly savedMediaKeys?: ReadonlySet<string>;
  readonly onSaveTitle?: SaveToWatchlist;
}

const EMPTY_SAVED_MEDIA_KEYS: ReadonlySet<string> = new Set();

const saveForCurrentVisit: SaveToWatchlist = () => ({
  outcome: "added",
  persistence: "session-only",
});

export function PreferenceEntryFlow({
  analyticsPickerAttemptKey = 0,
  analyticsSessionId = null,
  onContextSubmitted,
  onPickerStarted,
  onSaveTitle = saveForCurrentVisit,
  savedMediaKeys = EMPTY_SAVED_MEDIA_KEYS,
}: PreferenceEntryFlowProps = {}) {
  const [draft, setDraft] = useState<PreferenceDraft>(() =>
    createDefaultPreferenceDraft(),
  );
  const [reviewed, setReviewed] = useState<PreferenceInterpretation | null>(
    null,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ignoredUnsupported, setIgnoredUnsupported] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const pickerStartedAttempt = useRef<number | null>(null);
  const freshnessYearInputRef = useRef<HTMLInputElement | null>(null);

  const currentYear = new Date().getFullYear();

  const freshnessYearInvalid =
    draft.freshnessYear !== null &&
    (!Number.isInteger(draft.freshnessYear) ||
      draft.freshnessYear < 1870 ||
      draft.freshnessYear > currentYear);

  function markPickerStarted(): void {
    if (
      analyticsSessionId === null ||
      pickerStartedAttempt.current === analyticsPickerAttemptKey
    ) {
      return;
    }

    if (trackPickerStarted(analyticsSessionId, analyticsPickerAttemptKey)) {
      pickerStartedAttempt.current = analyticsPickerAttemptKey;
      onPickerStarted?.();
    }
  }

  const liveInterpretation = useMemo(
    () => interpretPreferences(draft),
    [draft],
  );

  const mediaForControls: PreferenceMediaType = draft.mediaType ?? "either";

  const availableGenres = getGenreOptions(mediaForControls);
  const quickGenres = getQuickGenreOptions(mediaForControls);
  const quickGenreKeys = new Set(quickGenres.map((genre) => genre.key));
  const additionalGenres = availableGenres.filter(
    (genre) => !quickGenreKeys.has(genre.key),
  );

  function setMediaType(mediaType: PreferenceMediaType): void {
    const validKeys = new Set(
      getGenreOptions(mediaType).map((genre) => genre.key),
    );

    setDraft((current) => ({
      ...current,
      mediaType,
      preferredGenreKeys: current.preferredGenreKeys.filter((key) =>
        validKeys.has(key),
      ),
      excludedGenreKeys: current.excludedGenreKeys.filter((key) =>
        validKeys.has(key),
      ),
      suppressedKeys: clearSuppression(current.suppressedKeys, [
        "hard.mediaType",
      ]),
    }));
  }

  function togglePreferredGenre(key: string): void {
    setDraft((current) => ({
      ...current,
      preferredGenreKeys: toggleValue(current.preferredGenreKeys, key),
      excludedGenreKeys: current.excludedGenreKeys.filter(
        (candidate) => candidate !== key,
      ),
      suppressedKeys: clearSuppression(current.suppressedKeys, [
        `preferredGenre.${key}`,
        `excludedGenre.${key}`,
      ]),
    }));
  }

  function toggleExcludedGenre(key: string): void {
    setDraft((current) => ({
      ...current,
      excludedGenreKeys: toggleValue(current.excludedGenreKeys, key),
      preferredGenreKeys: current.preferredGenreKeys.filter(
        (candidate) => candidate !== key,
      ),
      suppressedKeys: clearSuppression(current.suppressedKeys, [
        `preferredGenre.${key}`,
        `excludedGenre.${key}`,
      ]),
    }));
  }

  function handleReview(): void {
    if (freshnessYearInvalid) {
      freshnessYearInputRef.current?.focus();
      return;
    }

    markPickerStarted();

    if (analyticsSessionId !== null) {
      trackPickerStepCompleted(analyticsSessionId, analyticsPickerAttemptKey);
    }

    setReviewed(interpretPreferences(draft));
    setIgnoredUnsupported(false);
    setStatusMessage("");
  }

  function handleRemovePreference(key: string): void {
    const nextDraft = removePreferenceFromDraft(draft, key);
    setDraft(nextDraft);
    setReviewed(interpretPreferences(nextDraft));
  }

  function handleWatchRegion(region: string): void {
    setDraft((current) => ({
      ...current,
      watchRegion: region,
      requiredProviderIds: region === "US" ? current.requiredProviderIds : [],
    }));
  }

  function toggleProvider(id: number): void {
    setDraft((current) => ({
      ...current,
      requiredProviderIds: toggleValue(current.requiredProviderIds, id),
      suppressedKeys: clearSuppression(current.suppressedKeys, [
        `hard.provider.${id}`,
      ]),
    }));
  }

  if (reviewed === null) {
    return (
      <div className="preference-flow">
        <div className="preference-flow__introduction">
          <p className="eyebrow">Start with words or tags</p>
          <h2 id="preference-entry-heading">What would feel right to watch?</h2>
          <p>
            Add as much or as little as you know. PickTonight will show its
            deterministic interpretation before requesting any picks.
          </p>
        </div>

        <div
          className="preference-entry"
          aria-labelledby="preference-entry-heading"
          onClickCapture={markPickerStarted}
          onInputCapture={markPickerStarted}
        >
          <div className="preference-entry__text">
            <label htmlFor="preference-text">
              Tell PickTonight what you want <span>(optional)</span>
            </label>
            <textarea
              aria-describedby="preference-text-help"
              id="preference-text"
              maxLength={240}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  rawText: event.currentTarget.value,
                  suppressedKeys: [],
                }))
              }
              placeholder='For example: "funny Korean movie under two hours"'
              rows={3}
              value={draft.rawText}
            />
            <small id="preference-text-help">
              Your typed request stays in this active decision. It is not
              written to PickTonight local storage or analytics.
            </small>
          </div>

          <fieldset className="preference-group">
            <legend>Media type</legend>
            <div className="preference-chips">
              {MEDIA_OPTIONS.map((option) => (
                <button
                  aria-pressed={draft.mediaType === option.value}
                  key={option.value}
                  onClick={() => setMediaType(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="preference-group">
            <legend>Mood</legend>
            <div className="preference-chips">
              {MOOD_OPTIONS.map((option) => (
                <button
                  aria-pressed={draft.mood === option.value}
                  key={option.value}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      mood: option.value,
                      suppressedKeys: clearSuppression(current.suppressedKeys, [
                        "soft.mood",
                      ]),
                    }))
                  }
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset
            aria-describedby="preference-genre-help"
            className="preference-group"
          >
            <legend>Genre</legend>
            <p className="preference-group__help" id="preference-genre-help">
              Genre choices follow the selected media type. Either shows only
              genre IDs that map cleanly across movies and TV.
            </p>
            <div className="preference-chips">
              {quickGenres.map((genre) => (
                <button
                  aria-label={`Prefer ${genre.label}`}
                  aria-pressed={draft.preferredGenreKeys.includes(genre.key)}
                  key={genre.key}
                  onClick={() => togglePreferredGenre(genre.key)}
                  type="button"
                >
                  {genre.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="preference-group">
            <legend>Available time</legend>
            <div className="preference-chips">
              {TIME_OPTIONS.map((option) => (
                <button
                  aria-pressed={draft.maximumRuntimeMinutes === option.value}
                  key={String(option.value)}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      maximumRuntimeMinutes: option.value,
                      suppressedKeys: clearSuppression(current.suppressedKeys, [
                        "hard.runtime",
                      ]),
                    }))
                  }
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <details
            className="preference-more"
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            open={advancedOpen}
          >
            <summary>More preferences</summary>

            <div className="preference-more__content">
              {additionalGenres.length > 0 ? (
                <fieldset className="preference-group">
                  <legend>More preferred genres</legend>
                  <div className="preference-chips">
                    {additionalGenres.map((genre) => (
                      <button
                        aria-label={`Prefer ${genre.label}`}
                        aria-pressed={draft.preferredGenreKeys.includes(
                          genre.key,
                        )}
                        key={genre.key}
                        onClick={() => togglePreferredGenre(genre.key)}
                        type="button"
                      >
                        {genre.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <fieldset
                aria-describedby="preference-excluded-genres-help"
                className="preference-group"
              >
                <legend>Exclude genres</legend>
                <p
                  className="preference-group__help"
                  id="preference-excluded-genres-help"
                >
                  Exclusions are required restrictions, not soft preferences.
                </p>
                <div className="preference-chips preference-chips--danger">
                  {availableGenres.map((genre) => (
                    <button
                      aria-label={`Exclude ${genre.label}`}
                      aria-pressed={draft.excludedGenreKeys.includes(genre.key)}
                      key={genre.key}
                      onClick={() => toggleExcludedGenre(genre.key)}
                      type="button"
                    >
                      {genre.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset
                aria-describedby="preference-companion-help"
                className="preference-group"
              >
                <legend>Watching with</legend>
                <div className="preference-chips">
                  {COMPANION_OPTIONS.map((option) => (
                    <button
                      aria-pressed={draft.companion === option.value}
                      key={option.value}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          companion: option.value,
                          suppressedKeys: clearSuppression(
                            current.suppressedKeys,
                            ["soft.companion"],
                          ),
                        }))
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p
                  className="preference-group__help"
                  id="preference-companion-help"
                >
                  Companion context is reviewable in Issue #27 but is not yet
                  sent to the recommendation API because the current engine has
                  no supported companion-fit field.
                </p>
              </fieldset>

              <div className="preference-fields">
                <div className="preference-field">
                  <label htmlFor="preference-release-year">
                    Released since year
                  </label>
                  <input
                    aria-describedby={
                      freshnessYearInvalid
                        ? "preference-release-year-help preference-release-year-error"
                        : "preference-release-year-help"
                    }
                    aria-invalid={freshnessYearInvalid || undefined}
                    id="preference-release-year"
                    inputMode="numeric"
                    max={currentYear}
                    min={1870}
                    onChange={(event) => {
                      const value = event.currentTarget.value;

                      setDraft((current) => ({
                        ...current,
                        freshnessYear: value === "" ? null : Number(value),
                        suppressedKeys: clearSuppression(
                          current.suppressedKeys,
                          ["soft.freshness"],
                        ),
                      }));
                    }}
                    placeholder="e.g. 2023"
                    ref={freshnessYearInputRef}
                    type="number"
                    value={draft.freshnessYear ?? ""}
                  />
                  <small id="preference-release-year-help">
                    Optional. Enter a four-digit year from 1870 through the
                    current year.
                  </small>
                  {freshnessYearInvalid ? (
                    <small id="preference-release-year-error">
                      Enter a four-digit year from 1870 through {currentYear}
                      before reviewing preferences.
                    </small>
                  ) : null}
                </div>

                <label>
                  <span>Content language</span>
                  <select
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        contentLanguage: event.currentTarget.value || null,
                        suppressedKeys: clearSuppression(
                          current.suppressedKeys,
                          ["soft.language"],
                        ),
                      }))
                    }
                    value={draft.contentLanguage ?? ""}
                  >
                    <option value="">Any language</option>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Origin country</span>
                  <select
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        originCountry: event.currentTarget.value || null,
                        suppressedKeys: clearSuppression(
                          current.suppressedKeys,
                          ["soft.origin"],
                        ),
                      }))
                    }
                    value={draft.originCountry ?? ""}
                  >
                    <option value="">Any origin</option>
                    {ORIGIN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="preference-field">
                  <label htmlFor="preference-watch-region">Watch region</label>
                  <select
                    aria-describedby="preference-watch-region-help"
                    id="preference-watch-region"
                    onChange={(event) =>
                      handleWatchRegion(event.currentTarget.value)
                    }
                    value={draft.watchRegion}
                  >
                    {WATCH_REGION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small id="preference-watch-region-help">
                    Changing region may change which provider restrictions are
                    available.
                  </small>
                </div>
              </div>

              <fieldset
                aria-describedby={
                  draft.watchRegion === "US"
                    ? "preference-provider-help preference-provider-selection-help"
                    : "preference-provider-help preference-provider-region-notice"
                }
                className="preference-group"
              >
                <legend>Streaming providers</legend>
                <p
                  className="preference-group__help"
                  id="preference-provider-help"
                >
                  The current MVP provider shortlist is verified for the United
                  States only. Availability remains regional and may change.
                </p>
                <div className="preference-chips">
                  {PROVIDER_OPTIONS.map((provider) => (
                    <button
                      aria-pressed={draft.requiredProviderIds.includes(
                        provider.id,
                      )}
                      disabled={draft.watchRegion !== "US"}
                      key={provider.id}
                      onClick={() => toggleProvider(provider.id)}
                      type="button"
                    >
                      {provider.label}
                    </button>
                  ))}
                </div>
                {draft.watchRegion !== "US" ? (
                  <p
                    className="preference-group__notice"
                    id="preference-provider-region-notice"
                  >
                    Provider restrictions are disabled for this region in the
                    current prototype. Choose United States to use the verified
                    MVP shortlist.
                  </p>
                ) : (
                  <p
                    className="preference-group__help"
                    id="preference-provider-selection-help"
                  >
                    Selecting multiple services means availability on at least
                    one selected provider.
                  </p>
                )}
              </fieldset>
            </div>
          </details>

          <div
            aria-atomic="true"
            aria-live="polite"
            className="selectivity"
            role="status"
          >
            <strong>{liveInterpretation.selectivity.label}</strong>
            <span>{liveInterpretation.selectivity.explanation}</span>
            <small>
              Selectivity describes how much the request narrows the candidate
              set. It does not measure recommendation accuracy.
            </small>
          </div>

          <button
            className="preference-entry__review"
            onClick={handleReview}
            type="button"
          >
            Review preferences
          </button>
        </div>
      </div>
    );
  }

  const resolved = reviewed.resolved;
  const requiredRestrictionCount =
    (resolved.mediaType === undefined ? 0 : 1) +
    resolved.excludedGenreKeys.length +
    (resolved.maximumRuntimeMinutes === undefined ? 0 : 1) +
    resolved.requiredProviderIds.length;

  const softPreferenceCount =
    (resolved.mood === undefined ? 0 : 1) +
    resolved.preferredGenreKeys.length +
    (resolved.freshnessYear === undefined ? 0 : 1) +
    (resolved.contentLanguage === undefined ? 0 : 1) +
    (resolved.originCountry === undefined ? 0 : 1) +
    (resolved.companion === undefined ? 0 : 1);

  const analyticsContextSummary: ContextSummaryProperties = {
    media_type_code: resolved.mediaType,
    mood_code: resolved.mood,
    companion_code: resolved.companion,
    maximum_runtime_minutes: resolved.maximumRuntimeMinutes,
    freshness_year: resolved.freshnessYear,
    content_language_code: resolved.contentLanguage,
    origin_country_code: resolved.originCountry,
    watch_region_code: resolved.watchRegion,
    used_typed_input: draft.rawText.trim().length > 0,
    required_restriction_count: requiredRestrictionCount,
    soft_preference_count: softPreferenceCount,
  };

  return (
    <div className="preference-flow">
      <section
        aria-labelledby="preference-review-heading"
        className="preference-review"
      >
        <div className="preference-flow__introduction">
          <p className="eyebrow">Interpret before recommending</p>
          <h2 id="preference-review-heading">Review what we understood</h2>
          <p>
            Required restrictions determine eligibility. Soft preferences
            influence ranking. You can remove an interpreted item or go back and
            correct the request.
          </p>
        </div>

        {reviewed.conflicts.length > 0 ? (
          <div className="preference-review__notice">
            <h3>Explicit controls took priority</h3>
            <ul>
              {reviewed.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section
          aria-labelledby="required-restrictions-heading"
          className="preference-review__group"
        >
          <h3 id="required-restrictions-heading">Required restrictions</h3>

          {requiredRestrictionCount === 0 ? (
            <p>No required restrictions.</p>
          ) : (
            <ul>
              {resolved.mediaType !== undefined ? (
                <ReviewRow
                  label="Media"
                  onRemove={handleRemovePreference}
                  removeKey="hard.mediaType"
                  value={getMediaLabel(resolved.mediaType)}
                />
              ) : null}

              {resolved.excludedGenreKeys.map((key) => (
                <ReviewRow
                  key={key}
                  label="Excluded genre"
                  onRemove={handleRemovePreference}
                  removeKey={`excludedGenre.${key}`}
                  value={getGenreLabel(key)}
                />
              ))}

              {resolved.maximumRuntimeMinutes !== undefined ? (
                <ReviewRow
                  label="Maximum time"
                  onRemove={handleRemovePreference}
                  removeKey="hard.runtime"
                  value={`${resolved.maximumRuntimeMinutes} minutes`}
                />
              ) : null}

              {resolved.requiredProviderIds.map((id) => (
                <ReviewRow
                  key={id}
                  label="Required provider"
                  note="Confirmed availability is evaluated in the selected watch region."
                  onRemove={handleRemovePreference}
                  removeKey={`hard.provider.${id}`}
                  value={getProviderLabel(id)}
                />
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="soft-preferences-heading"
          className="preference-review__group"
        >
          <h3 id="soft-preferences-heading">Soft preferences</h3>

          {softPreferenceCount === 0 ? (
            <p>No optional ranking preferences.</p>
          ) : (
            <ul>
              {resolved.mood !== undefined ? (
                <ReviewRow
                  label="Mood"
                  onRemove={handleRemovePreference}
                  removeKey="soft.mood"
                  value={getMoodLabel(resolved.mood)}
                />
              ) : null}

              {resolved.preferredGenreKeys.map((key) => (
                <ReviewRow
                  key={key}
                  label="Preferred genre"
                  onRemove={handleRemovePreference}
                  removeKey={`preferredGenre.${key}`}
                  value={getGenreLabel(key)}
                />
              ))}

              {resolved.freshnessYear !== undefined ? (
                <ReviewRow
                  label="Freshness"
                  onRemove={handleRemovePreference}
                  removeKey="soft.freshness"
                  value={`Released since ${resolved.freshnessYear}`}
                />
              ) : null}

              {resolved.contentLanguage !== undefined ? (
                <ReviewRow
                  label="Content language"
                  onRemove={handleRemovePreference}
                  removeKey="soft.language"
                  value={getLanguageLabel(resolved.contentLanguage)}
                />
              ) : null}

              {resolved.originCountry !== undefined ? (
                <ReviewRow
                  label="Origin"
                  onRemove={handleRemovePreference}
                  removeKey="soft.origin"
                  value={getCountryLabel(resolved.originCountry)}
                />
              ) : null}

              {resolved.companion !== undefined ? (
                <ReviewRow
                  label="Watching with"
                  note="Context only for now; this value is not sent to the current recommendation API."
                  onRemove={handleRemovePreference}
                  removeKey="soft.companion"
                  value={getCompanionLabel(resolved.companion)}
                />
              ) : null}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="viewing-access-heading"
          className="preference-review__group"
        >
          <h3 id="viewing-access-heading">Viewing access</h3>
          <ul>
            <ReviewRow
              label="Watch region"
              onRemove={handleRemovePreference}
              value={getCountryLabel(resolved.watchRegion)}
            />
          </ul>
        </section>

        {!ignoredUnsupported && reviewed.unsupportedText.length > 0 ? (
          <section
            aria-labelledby="unsupported-heading"
            className="preference-review__unsupported"
          >
            <h3 id="unsupported-heading">We weren't sure about</h3>
            <p>
              PickTonight did not silently turn these words into preferences:
            </p>
            <ul>
              {reviewed.unsupportedText.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
            <div className="preference-review__unsupported-actions">
              <button
                onClick={() => {
                  setAdvancedOpen(true);
                  setReviewed(null);
                }}
                type="button"
              >
                Add a preference
              </button>
              <button onClick={() => setIgnoredUnsupported(true)} type="button">
                Ignore
              </button>
              <button onClick={() => setReviewed(null)} type="button">
                Edit request
              </button>
            </div>
          </section>
        ) : null}

        <div className="selectivity">
          <strong>{reviewed.selectivity.label}</strong>
          <span>{reviewed.selectivity.explanation}</span>
          <small>This is a selectivity label, not an accuracy score.</small>
        </div>

        <button
          className="preference-review__back"
          onClick={() => setReviewed(null)}
          type="button"
        >
          Back to request
        </button>
      </section>

      <section aria-labelledby="preview-heading" className="preference-results">
        <div className="preview-introduction">
          <p className="eyebrow">Recommendation interface</p>
          <h2 id="preview-heading">Your reviewed request</h2>
          <p>
            PickTonight uses these reviewed preferences to request three
            recommendations. TMDB credentials remain on the server and are never
            sent to the browser.
          </p>
        </div>

        <RecommendationRequestPanel
          analyticsContextSummary={analyticsContextSummary}
          analyticsSessionId={analyticsSessionId}
          key={JSON.stringify(reviewed.request)}
          onBeforeContextSubmit={markPickerStarted}
          onContextSubmitted={onContextSubmitted}
          requestRecommendations={requestConfiguredRecommendations}
          submitLabel="Show 3 picks"
          submittedPreferences={reviewed.request}
        >
          {(recommendations, updateRecommendations, analyticsContext) => (
            <FeedbackRecommendationExperience
              analyticsContext={analyticsContext}
              onSaveTitle={onSaveTitle}
              savedMediaKeys={savedMediaKeys}
              onEditRequiredRestrictions={() => {
                setReviewed(null);
                setStatusMessage("");
              }}
              onStatusMessage={setStatusMessage}
              recommendations={recommendations}
              submittedPreferences={reviewed.request}
              updateRecommendations={updateRecommendations}
            />
          )}
        </RecommendationRequestPanel>

        <p
          aria-atomic="true"
          aria-label="Preview action status"
          aria-live="polite"
          className="action-status"
          role="status"
        >
          {statusMessage}
        </p>
      </section>
    </div>
  );
}
