const requestButton = document.querySelector("#request-movie");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

requestButton.addEventListener("click", async () => {
  requestButton.disabled = true;
  status.textContent = "Requesting one normalized movie...";
  result.textContent = "";

  try {
    const response = await fetch("/api/tmdb-proof", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ?? "The proof request could not be completed.",
      );
    }

    status.textContent = "Received a normalized movie from the local server.";
    result.textContent = JSON.stringify(payload.movie, null, 2);
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "The proof request could not be completed.";
  } finally {
    requestButton.disabled = false;
  }
});
