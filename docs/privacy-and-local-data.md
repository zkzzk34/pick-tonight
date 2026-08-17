# PickTonight Privacy, Local Data, and Optional Analytics

- **Status:** Planned MVP behavior; not yet implemented
- **Owner:** ZK Zhao
- **Date:** August 17, 2026
- **Related issue:** [#5 — Draft privacy, local-data, and analytics-consent language](https://github.com/zkzzk34/pick-tonight/issues/5)
- **Requirements:** [Product Requirements and Research Boundaries](./product-requirements.md)

## Purpose

This document defines the planned plain-language privacy behavior for the PickTonight MVP.

It distinguishes active-session information, the local watchlist, optional local taste personalization, and optional product analytics. These are separate mechanisms and must not be presented as one shared data system.

This is a product-behavior specification, not legal advice or a final production privacy notice. Before deployment, the actual implementation, hosting environment, analytics provider, operational logs, data retention, and third-party behavior must be verified and documented.

## At a glance

- PickTonight does not require an account.
- The core recommendation experience works without analytics or personalization.
- Raw free-form preference text remains limited to the active session.
- The watchlist stays in the current browser unless the user clears it.
- A local taste profile is created only when the user enables personalization.
- Nonessential product analytics remain off until the user allows them.
- Analytics and local personalization use separate choices and controls.
- A complete reset removes PickTonight data stored in the current browser.
- PickTonight does not claim that pseudonymous analytics are fully anonymous.

## Separate data contexts

| Context | Purpose | Planned location | Created when |
|---|---|---|---|
| Active-session state | Complete one immediate viewing decision | Browser memory or other session-scoped state | When a recommendation session begins |
| Local watchlist | Remember titles explicitly saved by the user | Persistent storage for the current browser, device, and site origin | When the user selects `Save` |
| Optional local taste profile | Remember minimal normalized taste signals | Separate persistent local storage in the current browser | Only after the user enables personalization |
| Optional product analytics | Measure whether the product flow works | Sent to a later-selected analytics service | Only after prior analytics consent |

Declining analytics or personalization must not block recommendation, replacement, title-detail, or decision features.

## Active-session information

Active-session state may contain:

- raw supported preference words while they are being interpreted;
- normalized current preferences;
- hard restrictions and soft preferences;
- titles already shown during the session;
- temporary actions such as `Not tonight`;
- the current recommendation and replacement state.

Raw free-form preference text must not be written to persistent application storage or analytics.

Normalized preferences may be sent to the recommendation service when required to produce results. They remain current-session inputs and do not automatically become historical taste signals.

Starting a new decision or using the complete reset must remove the previous active-session state. The implementation must verify that session data is not unintentionally restored as persistent profile data.

## Local watchlist

The watchlist is created through explicit `Save` actions.

It must:

- remain separate from the taste profile;
- use only the minimum normalized title reference needed to restore a saved title;
- remain in the current browser, device, and site origin;
- work without an account;
- avoid claiming cross-device synchronization;
- include a control for removing an individual title;
- include a control for clearing the complete watchlist.

Saving a title does not prove that the title was watched or liked. It provides a weak taste signal only when personalization is enabled.

### Proposed watchlist explanation

> Saved titles stay in this browser. They are not connected to an account or synchronized with another browser or device. Clearing PickTonight data or your browser's site data removes them.

## Optional local taste personalization

PickTonight creates a taste profile only after the user explicitly enables personalization.

The first profile may contain only minimal normalized signals such as:

- positive or negative genre signals;
- movie or television tendency;
- supported content-language or origin-country preferences;
- title identifiers needed to remember saved, shown, watched, or rejected titles;
- explicit `More like this` and `Not my taste` actions.

It must not contain:

- raw free-form preference text;
- free-form rejection reasons;
- written feedback;
- external links supplied by the user;
- names, email addresses, or credentials;
- precise location;
- entertainment title overviews.

Current-session preferences always override historical taste signals.

Disabling personalization must:

- stop the stored profile from influencing recommendations;
- stop new actions from being added to the profile;
- leave the core recommendation experience available.

The user must also have separate controls to clear the taste profile and to reset all PickTonight local data.

### Proposed personalization explanation

> Personalization is optional. If you enable it, PickTonight stores a small taste profile in this browser using actions such as `More like this` and `Not my taste`. Your current request always takes priority. Nothing synchronizes to another device.

Suggested choices:

- `Enable personalization`
- `Not now`
- `Learn what is stored`

### Proposed disable-personalization explanation

> Turning off personalization stops your local taste profile from affecting recommendations or receiving new signals. You can separately clear the stored profile.

## Browser-storage limits

Browser-local data is associated with the current browser profile and PickTonight's site origin.

Users must be told that:

- local data does not synchronize across devices;
- another browser on the same device has separate storage;
- browser settings, storage eviction, private browsing, or clearing site data may remove it;
- PickTonight local data is not a durable backup;
- a shared browser profile may make locally stored choices visible to another person using that profile.

PickTonight must not store credentials, secrets, or other sensitive information in browser-local storage.

## Optional product analytics

### Default behavior and consent

Nonessential product analytics remain disabled until the user makes an affirmative choice.

Declining analytics:

- does not prevent use of the core experience;
- does not enable personalization;
- does not clear the watchlist;
- does not create an analytics identifier.

The analytics choice must remain separate from the personalization choice.

This consent-first behavior is a PickTonight product requirement even where a particular jurisdiction may provide an exception for limited statistical technologies.

### Proposed analytics prompt

**Help improve PickTonight?**

> If you allow usage analytics, PickTonight will send limited interaction events, such as whether recommendations loaded and which named action was used. It will not send your typed request, written feedback, name, email address, precise location, links you enter, title descriptions, or the contents of your local taste profile.
>
> You can use all core features if you decline, and you can change this choice later.

Suggested choices:

- `Allow analytics`
- `No thanks`
- `Review details`

The allow and decline choices must be presented with comparable prominence and understandable wording.

### Analytics property allowlist

Analytics events must use explicit typed property allowlists.

Only reviewed event names and normalized properties may be eligible. The final event schema will be defined and tested under the analytics-property verification work.

The following must remain outside persistent analytics:

- raw preference text;
- written or free-form feedback;
- free-form rejection reasons;
- names and email addresses;
- credentials or secrets;
- precise location;
- user-supplied links;
- title overviews;
- the contents of the local taste profile.

IP addresses must not be intentionally added as analytics properties, used to derive an identifier, or used for device fingerprinting. Provider and infrastructure handling of network metadata must be verified before analytics are enabled.

## Analytics identifier

If analytics are enabled, PickTonight may create a random pseudonymous identifier.

The identifier must:

- be created only after analytics consent;
- not be derived from a name, email address, IP address, precise location, or device fingerprint;
- not be shared with the taste-profile identifier;
- not claim to identify the same person across browsers or devices;
- be removed or rotated when analytics consent is withdrawn;
- be removed during a complete local-data reset.

A pseudonymous identifier is not automatically anonymous. PickTonight must not describe analytics as fully anonymous unless the implemented provider, event data, network metadata, retention, and re-identification risk have been verified to support that claim.

## Withdrawing analytics consent

The user must be able to change the analytics choice later.

Withdrawing consent must:

- stop future nonessential analytics events;
- remove the local analytics identifier;
- stop analytics storage or access that depended on the consent;
- leave the watchlist and core recommendation flow available;
- explain any effect on information already sent.

PickTonight must not promise that previously sent events can be individually located or deleted until the selected provider and identifier design support that operation.

### Proposed withdrawal confirmation

> Optional analytics are now off. PickTonight will stop sending product-usage events and will remove the analytics identifier stored in this browser. Your watchlist and personalization choice are unchanged.

## Local-data controls

| Control | Effect |
|---|---|
| Decline analytics | Sends no nonessential product analytics and creates no analytics identifier |
| Withdraw analytics consent | Stops future analytics and removes or rotates the local analytics identifier |
| Disable personalization | Stops the profile from influencing recommendations or receiving new taste signals |
| Clear taste profile | Deletes the locally stored taste profile |
| Clear watchlist | Deletes locally saved titles |
| Reset all PickTonight data | Deletes session state, watchlist, taste profile, consent choices, and local identifiers |

### Proposed complete-reset confirmation

**Clear all PickTonight data from this browser?**

> This removes your saved titles, local taste profile, analytics choice, and local identifiers. It cannot be undone. It does not promise deletion of information that was already sent before analytics was turned off.

Suggested choices:

- `Clear all data`
- `Cancel`

## Analytics provider gate

No analytics provider has been approved by this document.

Product analytics must remain disabled until the project verifies and documents:

- the provider and its applicable privacy terms;
- every event and property sent;
- IP-address and network-metadata handling;
- cookies, browser storage, or other identifiers used;
- hosting and processing locations;
- default and configured retention periods;
- access controls;
- third-party sharing or subprocessors;
- consent withdrawal behavior;
- deletion and reset limitations.

Issue #31 will define the pseudonymous analytics identity. Issue #34 will verify the final event-property allowlist.

## Operational-data boundary

This document governs nonessential product analytics and user-controlled local product data.

A deployed server may require limited security, reliability, or diagnostic logs to operate. Those logs must not be silently treated as product analytics. Their contents, purposes, retention, access, and hosting behavior must be reviewed and disclosed before launch.

## Implementation checks

The later implementation must verify that:

- no nonessential analytics request occurs before consent;
- declining analytics leaves the core flow functional;
- analytics and personalization choices are independent;
- raw preference text never enters persistent storage or analytics;
- disabling personalization stops profile reads and writes;
- clearing the taste profile does not silently clear unrelated state;
- the complete reset removes all PickTonight-controlled browser data;
- withdrawing analytics consent removes or rotates the analytics identifier;
- malformed, unavailable, outdated, or cleared local storage is handled safely;
- user-facing explanations match the implemented behavior.

## References

These sources inform the product behavior but do not by themselves establish legal compliance:

- [Protecting Personal Information: A Guide for Business — U.S. Federal Trade Commission](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business)
- [Privacy and Security Enforcement — U.S. Federal Trade Commission](https://www.ftc.gov/news-events/topics/protecting-consumer-privacy-security/privacy-security-enforcement)
- [Web Storage API — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [`localStorage` — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [Pseudonymisation — UK Information Commissioner's Office](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/)
- [Managing consent in practice — UK Information Commissioner's Office](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/)
