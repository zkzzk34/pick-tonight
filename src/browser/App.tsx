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
  return (
    <div className="app-shell">
      <header className="site-header">
        <span className="wordmark">PickTonight</span>
        <span className="prototype-badge">Working prototype</span>
      </header>

      <main className="hero">
        <p className="eyebrow">Flexible input. Constrained output.</p>
        <h1>Choose what to watch without the endless scroll.</h1>
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
