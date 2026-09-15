import { useState } from "react";

import { AnalyticsConsentPanel, PrivacySection } from "./analytics-consent";
import {
  getAnalyticsConsentStorage,
  readAnalyticsConsent,
  resetAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsentChoice,
} from "./analytics-consent-storage";
import { Attribution } from "./attribution";
import { PreferenceEntryFlow } from "./preference-entry";

const productPromises = [
  {
    label: "Under two minutes",
    detail:
      "Designed to help you choose something tonight in under two minutes.",
  },
  {
    label: "Three focused options",
    detail:
      "Exactly three explainable recommendations when enough eligible titles are available.",
  },
  {
    label: "No account required",
    detail:
      "The core recommendation experience stays available without signing in.",
  },
] as const;

function App() {
  const [analyticsConsent, setAnalyticsConsent] =
    useState<AnalyticsConsentChoice | null>(() =>
      readAnalyticsConsent(getAnalyticsConsentStorage()),
    );

  const chooseAnalyticsConsent = (choice: AnalyticsConsentChoice) => {
    writeAnalyticsConsent(getAnalyticsConsentStorage(), choice);
    setAnalyticsConsent(choice);
  };

  const clearAnalyticsConsent = () => {
    resetAnalyticsConsent(getAnalyticsConsentStorage());
    setAnalyticsConsent(null);
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
            PickTonight is being built to help you choose something tonight in
            under two minutes by turning your mood, available time, and viewing
            context into exactly three explainable recommendations.
          </p>

          <ul
            aria-label="PickTonight product promises"
            className="product-promises"
          >
            {productPromises.map((promise) => (
              <li className="promise-card" key={promise.label}>
                <strong>{promise.label}</strong>
                <span>{promise.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <AnalyticsConsentPanel
          choice={analyticsConsent}
          onChoose={chooseAnalyticsConsent}
        />

        <section
          aria-label="Card presentation preview"
          className="recommendation-preview"
        >
          <PreferenceEntryFlow />
        </section>

        <PrivacySection
          choice={analyticsConsent}
          onReset={clearAnalyticsConsent}
        />

        <Attribution />
      </main>

      <footer className="site-footer">
        <span>Working title</span>
        <span aria-hidden="true">·</span>
        <span>Non-commercial prototype</span>
        <span aria-hidden="true">·</span>
        <a href="#privacy">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="#credits">Credits</a>
      </footer>
    </div>
  );
}

export default App;
