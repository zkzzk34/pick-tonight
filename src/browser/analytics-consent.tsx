import { useRef, useState } from "react";

import { ConfirmationDialog } from "./confirmation-dialog";
import type { AnalyticsConsentChoice } from "./analytics-consent-storage";

interface AnalyticsConsentPanelProps {
  choice: AnalyticsConsentChoice | null;
  onChoose: (choice: AnalyticsConsentChoice) => void;
}

interface CompleteResetResult {
  readonly analyticsStorageCleared: boolean;
  readonly watchlistStorageCleared: boolean;
}

interface PrivacySectionProps {
  readonly analyticsIdentityStatus: "disabled" | "ready" | "unavailable";
  readonly choice: AnalyticsConsentChoice | null;
  readonly savedTitleCount: number;
  readonly onResetAnalytics: () => boolean;
  readonly onClearWatchlist: () => boolean;
  readonly onResetAll: () => CompleteResetResult;
}

function getChoiceLabel(choice: AnalyticsConsentChoice | null): string {
  if (choice === "accepted") {
    return "Allowed";
  }

  if (choice === "declined") {
    return "Declined";
  }

  return "Not chosen";
}

export function AnalyticsConsentPanel({
  choice,
  onChoose,
}: AnalyticsConsentPanelProps) {
  if (choice !== null) {
    return (
      <section
        aria-labelledby="analytics-choice-heading"
        className="analytics-consent analytics-consent--resolved"
      >
        <div className="analytics-consent__copy">
          <p className="eyebrow">Optional analytics</p>
          <h2 id="analytics-choice-heading">
            Analytics choice: {choice === "accepted" ? "allowed" : "declined"}
          </h2>
          <p>
            Your recommendation experience stays available either way. You can
            review or reset this choice in Privacy &amp; local data.
          </p>
        </div>
        <a className="analytics-consent__link" href="#privacy">
          Manage privacy choice
        </a>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="analytics-consent-heading"
      className="analytics-consent"
    >
      <div className="analytics-consent__copy">
        <p className="eyebrow">Your choice</p>
        <h2 id="analytics-consent-heading">Help improve PickTonight?</h2>
        <p>
          If you allow optional usage analytics, PickTonight can use limited
          named interaction events, such as whether recommendations loaded or
          which named action was used.
        </p>
        <p>
          Your typed request, written feedback, name, email address, precise
          location, title descriptions, and local taste information are not
          included. All core features work if you decline.
        </p>
        <p>
          If you allow analytics, PickTonight creates random pseudonymous
          browser and tab-session identifiers used only for optional analytics.
          They are not derived from your name, email address, saved titles, or
          taste profile.
        </p>
      </div>

      <div
        aria-label="Analytics consent choices"
        className="analytics-consent__choices"
        role="group"
      >
        <button
          className="analytics-consent__choice"
          onClick={() => onChoose("accepted")}
          type="button"
        >
          Allow analytics
        </button>
        <button
          className="analytics-consent__choice"
          onClick={() => onChoose("declined")}
          type="button"
        >
          No thanks
        </button>
      </div>

      <a className="analytics-consent__link" href="#privacy">
        Review privacy details
      </a>
    </section>
  );
}

export function PrivacySection({
  analyticsIdentityStatus,
  choice,
  savedTitleCount,
  onResetAnalytics,
  onClearWatchlist,
  onResetAll,
}: PrivacySectionProps) {
  const [confirmation, setConfirmation] = useState<"watchlist" | "all" | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState("");
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const clearWatchlistButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetAllButtonRef = useRef<HTMLButtonElement | null>(null);

  const resetAnalytics = () => {
    const storageCleared = onResetAnalytics();

    setStatusMessage(
      storageCleared
        ? "Analytics choice and local analytics identifiers reset. Optional analytics are off and undecided."
        : "Analytics was reset for this visit, but browser storage could not be fully updated. A previous analytics choice or identifier may remain or return after reload.",
    );
  };

  const confirmWatchlistClear = () => {
    const clearedCount = savedTitleCount;
    const storageCleared = onClearWatchlist();

    setConfirmation(null);
    setStatusMessage(
      storageCleared
        ? `Cleared ${clearedCount} saved ${clearedCount === 1 ? "title" : "titles"} from this browser.`
        : `Removed ${clearedCount} saved ${clearedCount === 1 ? "title" : "titles"} from this visit, but browser storage could not be updated. Saved titles may return after reload.`,
    );
  };

  const confirmCompleteReset = () => {
    const resetResult = onResetAll();
    const storageFullyCleared =
      resetResult.analyticsStorageCleared &&
      resetResult.watchlistStorageCleared;
    const dataThatMayReturn =
      !resetResult.analyticsStorageCleared &&
      !resetResult.watchlistStorageCleared
        ? "Saved titles and analytics choice or identifier data"
        : resetResult.watchlistStorageCleared
          ? "Analytics choice or identifier data"
          : "Saved titles";

    setConfirmation(null);
    setStatusMessage(
      storageFullyCleared
        ? "All current PickTonight data was reset. Your active decision was also cleared."
        : `Current-session PickTonight data was reset, but browser storage could not be fully updated. ${dataThatMayReturn} may remain or return after reload.`,
    );
  };

  return (
    <>
      <section
        aria-labelledby="privacy-heading"
        className="privacy-section"
        id="privacy"
      >
        <div className="privacy-section__introduction">
          <p className="eyebrow">Privacy &amp; local data</p>
          <h2 id="privacy-heading">
            Your choice stays separate from your picks.
          </h2>
          <p>
            PickTonight does not require an account. Analytics consent, the
            local watchlist, and optional personalization are separate. Core
            recommendations remain available without any of them.
          </p>
        </div>

        <div className="privacy-section__details">
          <div className="privacy-section__detail">
            <h3>What optional analytics means</h3>
            <p>
              Optional usage analytics are limited to reviewed interaction
              events. They must not include your typed request, written
              feedback, name, email address, precise location, title
              descriptions, or local taste information.
            </p>
            <p>
              A configured analytics environment can send reviewed product
              events only after you allow analytics. Automated-test runtime is
              provider-disabled, and automatic collection remains disabled.
            </p>
          </div>

          <div className="privacy-section__detail">
            <h3>Your analytics choice</h3>
            <p>
              <strong>{getChoiceLabel(choice)}.</strong>{" "}
              {choice === null
                ? "Nonessential analytics remain off unless you make an affirmative choice."
                : "The choice is remembered in this browser when browser storage is available."}
            </p>

            {choice === "accepted" && analyticsIdentityStatus === "ready" ? (
              <p>
                PickTonight created a random pseudonymous browser identifier and
                a tab-scoped session identifier for optional analytics only.
                They do not contain your name or email address and are not
                intended to identify you across browsers or devices.
              </p>
            ) : choice === "accepted" &&
              analyticsIdentityStatus === "unavailable" ? (
              <p>
                You allowed analytics, but required browser storage or secure
                identifier generation is unavailable. PickTonight cannot
                establish the required analytics identifiers, so optional
                analytics remain unavailable for this visit.
              </p>
            ) : (
              <p>
                PickTonight does not create an analytics identifier unless you
                allow optional analytics.
              </p>
            )}

            <button
              className="privacy-section__reset"
              disabled={choice === null}
              onClick={resetAnalytics}
              type="button"
            >
              Reset analytics choice
            </button>
            <p className="privacy-section__reset-help">
              This removes the analytics-consent choice and local analytics
              identifiers. It does not clear saved titles or the active
              decision.
            </p>
          </div>

          <div className="privacy-section__detail">
            <h3>Local watchlist</h3>
            <p>
              <strong>
                {savedTitleCount} saved{" "}
                {savedTitleCount === 1 ? "title" : "titles"}.
              </strong>{" "}
              Saved titles stay in this browser and do not synchronize to
              another device. They remain separate from optional taste
              personalization.
            </p>
            <button
              className="privacy-section__reset"
              disabled={savedTitleCount === 0}
              onClick={() => setConfirmation("watchlist")}
              ref={clearWatchlistButtonRef}
              type="button"
            >
              Clear watchlist
            </button>
            <p className="privacy-section__reset-help">
              Clearing removes all saved titles after confirmation without
              changing analytics consent or interpreting the removal as a taste
              signal.
            </p>
          </div>

          <div className="privacy-section__detail">
            <h3>Complete local-data reset</h3>
            <p>
              Reset the watchlist, analytics choice and identifiers, and active
              decision, then return to Choose. Optional personalization data
              will belong to this same complete reset when that feature is
              available.
            </p>
            <button
              className="privacy-section__reset privacy-section__reset--danger"
              onClick={() => setConfirmation("all")}
              ref={resetAllButtonRef}
              type="button"
            >
              Reset all PickTonight data
            </button>
            <p className="privacy-section__reset-help">
              Only PickTonight-owned data is affected. Other site data is not
              broadly cleared.
            </p>
          </div>
        </div>

        <p
          aria-label="Local data reset status"
          aria-live="polite"
          className="privacy-section__status"
          ref={statusRef}
          role="status"
          tabIndex={-1}
        >
          {statusMessage}
        </p>
      </section>

      {confirmation === "watchlist" ? (
        <ConfirmationDialog
          confirmLabel="Clear watchlist"
          description="This removes every saved title from this browser. Analytics consent and your active decision will remain unchanged."
          getConfirmedFocus={() => statusRef.current}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmWatchlistClear}
          returnFocusRef={clearWatchlistButtonRef}
          title="Clear saved titles?"
        />
      ) : confirmation === "all" ? (
        <ConfirmationDialog
          confirmLabel="Reset all PickTonight data"
          description="This removes the local watchlist, analytics choice and identifiers, clears the active decision, and returns to Choose."
          getConfirmedFocus={() => statusRef.current}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmCompleteReset}
          returnFocusRef={resetAllButtonRef}
          title="Reset all PickTonight data?"
        />
      ) : null}
    </>
  );
}
