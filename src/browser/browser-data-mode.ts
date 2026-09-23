/**
 * Deterministic recommendation fixtures are allowed only in automated browser
 * and component-test execution.
 *
 * Normal Vite development, Vercel Preview, and pilot production builds use the
 * real same-origin product API.
 */
export function usesDeterministicBrowserFixtures(): boolean {
  return (
    import.meta.env.MODE === "test" ||
    import.meta.env.VITE_PICKTONIGHT_E2E_API === "1"
  );
}
