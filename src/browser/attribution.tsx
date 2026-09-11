const TMDB_WEBSITE = "https://www.themoviedb.org";
const JUSTWATCH_WEBSITE = "https://www.justwatch.com/";

export function Attribution() {
  return (
    <section
      aria-labelledby="credits-heading"
      className="attribution"
      id="credits"
    >
      <div className="attribution__introduction">
        <p className="eyebrow">Data sources</p>
        <h2 id="credits-heading">Credits</h2>
        <p>
          PickTonight is a non-commercial prototype that identifies its
          third-party entertainment and availability sources here.
        </p>
      </div>

      <div className="attribution__sources">
        <article className="attribution__source">
          <a
            aria-label="Visit TMDB"
            className="attribution__tmdb-link"
            href={TMDB_WEBSITE}
          >
            <img
              alt="TMDB"
              className="attribution__tmdb-logo"
              height="369"
              src="/tmdb-logo.svg"
              width="512"
            />
          </a>

          <div className="attribution__source-copy">
            <h3>Entertainment data and images</h3>
            <p className="attribution__notice">
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </p>
          </div>
        </article>

        <article className="attribution__source">
          <a className="attribution__justwatch-link" href={JUSTWATCH_WEBSITE}>
            JustWatch
          </a>

          <div className="attribution__source-copy">
            <h3>Watch-provider availability</h3>
            <p>
              Regional streaming, rental, and purchase availability is
              attributed to JustWatch when that information is shown.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
