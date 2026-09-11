import { useState } from "react";

import {
  replaceRecommendationAt,
  type RecommendationCardSet,
} from "./recommendation-card-model";
import {
  INITIAL_PREVIEW_RECOMMENDATIONS,
  PREVIEW_REPLACEMENT,
} from "./recommendation-card-preview";
import { RecommendationCards } from "./recommendation-cards";

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

function App() {
  const [recommendations, setRecommendations] = useState<RecommendationCardSet>(
    INITIAL_PREVIEW_RECOMMENDATIONS,
  );
  const [statusMessage, setStatusMessage] = useState("");

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
              the interface only. They are not live recommendations. Missing
              provider, trailer, freshness, and fit evidence remains marked
              unavailable.
            </p>
          </div>

          <RecommendationCards
            recommendations={recommendations}
            onAction={(action, recommendation) => {
              setStatusMessage(
                `${action.replaceAll("-", " ")} selected for ${recommendation.title}. Preview actions are not saved.`,
              );
            }}
            onReplace={(recommendation, index) => {
              setRecommendations((current) =>
                replaceRecommendationAt(current, index, PREVIEW_REPLACEMENT),
              );
              setStatusMessage(
                `${recommendation.title} was replaced with ${PREVIEW_REPLACEMENT.title}. The other recommendations stayed in place.`,
              );
            }}
          />

          <p className="action-status" role="status" aria-live="polite">
            {statusMessage}
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <span>Working title</span>
        <span aria-hidden="true">·</span>
        <span>Non-commercial prototype</span>
      </footer>
    </div>
  );
}

export default App;
