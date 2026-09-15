import type { AnalyticsConsentChoice } from "./analytics-consent-storage";

interface AnalyticsConsentPanelProps {
  choice: AnalyticsConsentChoice | null;
  onChoose: (choice: AnalyticsConsentChoice) => void;
}

interface PrivacySectionProps {
  choice: AnalyticsConsentChoice | null;
  onReset: () => void;
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
            review or reset this choice in Privacy &amp; analytics.
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

export function PrivacySection({ choice, onReset }: PrivacySectionProps) {
  return (
    <section
      aria-labelledby="privacy-heading"
      className="privacy-section"
      id="privacy"
    >
      <div className="privacy-section__introduction">
        <p className="eyebrow">Privacy &amp; analytics</p>
        <h2 id="privacy-heading">
          Your choice stays separate from your picks.
        </h2>
        <p>
          PickTonight does not require an account. Declining optional analytics
          does not disable recommendations or other core recommendation
          features.
        </p>
      </div>

      <div className="privacy-section__details">
        <div className="privacy-section__detail">
          <h3>What optional analytics means</h3>
          <p>
            Optional usage analytics are limited to reviewed interaction events.
            They must not include your typed request, written feedback, name,
            email address, precise location, title descriptions, or local taste
            information.
          </p>
          <p>
            This prototype does not currently send nonessential analytics
            because no analytics provider is enabled.
          </p>
        </div>

        <div className="privacy-section__detail">
          <h3>Your current choice</h3>
          <p>
            <strong>{getChoiceLabel(choice)}.</strong>{" "}
            {choice === null
              ? "Nonessential analytics remain off unless you make an affirmative choice."
              : "The choice is remembered in this browser when browser storage is available."}
          </p>
          <button
            className="privacy-section__reset"
            disabled={choice === null}
            onClick={onReset}
            type="button"
          >
            Reset analytics choice
          </button>
          <p className="privacy-section__reset-help">
            Resetting removes the stored consent choice and returns analytics to
            the safe default: off and undecided.
          </p>
        </div>
      </div>
    </section>
  );
}
