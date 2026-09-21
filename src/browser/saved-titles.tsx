import { useEffect, useRef, useState } from "react";

import type { SavedTitle } from "./watchlist-storage";

interface SavedTitlesProps {
  readonly persistence: "persistent" | "session-only";
  readonly savedTitles: readonly SavedTitle[];
  readonly onChoose: () => void;
  readonly onRemoveTitle: (mediaKey: string) => void;
}

function safePosterSource(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function SavedPoster({
  posterUrl,
  title,
}: Pick<SavedTitle, "posterUrl" | "title">) {
  const [imageFailed, setImageFailed] = useState(false);
  const source = safePosterSource(posterUrl);

  if (source === null || imageFailed) {
    return (
      <div
        aria-label={`Poster unavailable for ${title}`}
        className="saved-title__poster-placeholder"
        role="img"
      >
        <strong aria-hidden="true">PT</strong>
        <small>Poster unavailable</small>
      </div>
    );
  }

  return (
    <img
      alt={`Poster for ${title}`}
      className="saved-title__poster"
      loading="lazy"
      onError={() => setImageFailed(true)}
      src={source}
    />
  );
}

export function SavedTitles({
  persistence,
  savedTitles,
  onChoose,
  onRemoveTitle,
}: SavedTitlesProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const focusTargetRef = useRef<string | null>(null);
  const emptyActionRef = useRef<HTMLButtonElement | null>(null);
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const focusTarget = focusTargetRef.current;

    if (focusTarget === null) {
      return;
    }

    if (focusTarget === "") {
      emptyActionRef.current?.focus();
    } else {
      removeButtonRefs.current.get(focusTarget)?.focus();
    }

    focusTargetRef.current = null;
  }, [savedTitles]);

  function removeTitle(title: SavedTitle, index: number): void {
    const nextTitle = savedTitles[index + 1] ?? savedTitles[index - 1];
    focusTargetRef.current = nextTitle?.mediaKey ?? "";
    onRemoveTitle(title.mediaKey);
    setStatusMessage(`Removed ${title.title} from Saved.`);
  }

  return (
    <section aria-labelledby="saved-heading" className="saved-titles">
      <div className="saved-titles__introduction">
        <p className="eyebrow">Local watchlist</p>
        <h1 id="saved-heading">Saved for later</h1>
        <p>
          Saved titles stay only in this browser, on this device, and for this
          site. They do not synchronize to another browser or device.
        </p>
      </div>

      {persistence === "session-only" ? (
        <p className="saved-titles__warning">
          Persistent browser storage is unavailable. These saves will remain
          only for this open visit.
        </p>
      ) : null}

      {savedTitles.length === 0 ? (
        <div className="saved-titles__empty">
          <h2>Nothing saved yet</h2>
          <p>Save a recommendation and it will appear here.</p>
          <button onClick={onChoose} ref={emptyActionRef} type="button">
            Find something to watch
          </button>
        </div>
      ) : (
        <ol
          aria-label="Saved titles, newest first"
          className="saved-titles__list"
        >
          {savedTitles.map((title, index) => (
            <li key={title.mediaKey}>
              <article className="saved-title">
                <SavedPoster posterUrl={title.posterUrl} title={title.title} />
                <div className="saved-title__body">
                  <h2>{title.title}</h2>
                  <p className="saved-title__identity">
                    {title.year ?? "Year unavailable"}
                    <span aria-hidden="true"> · </span>
                    {title.mediaType === "movie" ? "Movie" : "Television"}
                  </p>
                  <button
                    aria-label={`Remove: ${title.title}`}
                    onClick={() => removeTitle(title, index)}
                    ref={(node) => {
                      if (node === null) {
                        removeButtonRefs.current.delete(title.mediaKey);
                      } else {
                        removeButtonRefs.current.set(title.mediaKey, node);
                      }
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}

      <p
        aria-atomic="true"
        aria-label="Saved titles status"
        aria-live="polite"
        className="saved-titles__status"
        role="status"
      >
        {statusMessage}
      </p>
    </section>
  );
}
