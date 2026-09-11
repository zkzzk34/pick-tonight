import { useState } from "react";

import type { RecommendationRequest } from "../shared/recommendation-contracts";
import { Attribution } from "./attribution";
import { replaceRecommendationAt } from "./recommendation-card-model";
import {
  INITIAL_PREVIEW_RECOMMENDATIONS,
  PREVIEW_REPLACEMENT,
} from "./recommendation-card-preview";
import { RecommendationCards } from "./recommendation-cards";
import { RecommendationRequestPanel } from "./recommendation-request-panel";
import type { RecommendationRequester } from "./recommendation-request-state";

const productPromises = [
  {
    label: "Under two minutes",
    detail: "Designed to move from uncertainty to a confident choice quickly.",
  },
  {
    label: "Three focused options",
    detail:
      "A constrained result set when enough eligible titles are available.",
  },
  {
    label: "No account required",
    detail:
      "The core recommendation experience stays available without signing in.",
  },
] as const;

const PREVIEW_SUBMITTED_PREFERENCES = {
  hardRestrictions: {
    maximumRuntimeMinutes: 120,
  },
  softPreferences: {
    mood: "laughing",
  },
  watchRegion: "US",
} satisfies RecommendationRequest;

function App() {
  const [statusMessage, setStatusMessage] = useState("");

  const requestPreviewRecommendations: RecommendationRequester = () => {
    setStatusMessage("");

    return Promise.resolve({
      status: "complete",
      recommendations: INITIAL_PREVIEW_RECOMMENDATIONS,
    });
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <span className="wordmark">PickTonight</span>
        <span className="prototype-badge">Working prototype</span>
      </header>

      <main>
        <section className="hero" aria-labelledby="product-heading">
          <p className="eyebrow">Flexible input. Constrained output.</p>
          <h1 id="product-heading">
            Choose what to watch without the endless scroll.
          </h1>
          <p className="hero-copy">
            PickTonight is being built to turn your mood, available time, and
            viewing context into exactly three explainable recommendations.
          </p>

          <ul
            className="product-promises"
            aria-label="PickTonight product promises"
          >
            {productPromises.map((promise) => (
              <li className="promise-card" key={promise.label}>
                <strong>{promise.label}</strong>
                <span>{promise.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="recommendation-preview"
          aria-labelledby="preview-heading"
        >
          <div className="preview-introduction">
            <p className="eyebrow">Recommendation interface</p>
            <h2 id="preview-heading">Card presentation preview</h2>
            <p>
              These clearly labeled placeholder titles and values demonstrate
              the interface only. The request control below replays the same
              local sample; it does not call TMDB or another live recommendation
              service. Missing provider, trailer, freshness, and fit evidence
              remains marked unavailable.
            </p>
          </div>

          <RecommendationRequestPanel
            initialRecommendations={INITIAL_PREVIEW_RECOMMENDATIONS}
            requestRecommendations={requestPreviewRecommendations}
            submittedPreferences={PREVIEW_SUBMITTED_PREFERENCES}
          >
            {(recommendations, updateRecommendations) => (
              <RecommendationCards
                recommendations={recommendations}
                onAction={(action, recommendation) => {
                  setStatusMessage(
                    `${action.replaceAll("-", " ")} selected for ${recommendation.title}. Preview actions are not saved.`,
                  );
                }}
                onReplace={(recommendation, index) => {
                  updateRecommendations((current) =>
                    replaceRecommendationAt(
                      current,
                      index,
                      PREVIEW_REPLACEMENT,
                    ),
                  );
                  setStatusMessage(
                    `${recommendation.title} was replaced with ${PREVIEW_REPLACEMENT.title}. The other recommendations stayed in place.`,
                  );
                }}
              />
            )}
          </RecommendationRequestPanel>

          <p
            aria-label="Preview action status"
            aria-live="polite"
            className="action-status"
            role="status"
          >
            {statusMessage}
          </p>
        </section>

        <Attribution />
      </main>

      <footer className="site-footer">
        <span>Working title</span>
        <span aria-hidden="true">·</span>
        <span>Non-commercial prototype</span>
        <span aria-hidden="true">·</span>
        <a href="#credits">Credits</a>
      </footer>
    </div>
  );
}

export default App;
