/**
 * Fishing rules are set by the state, not by the park.
 *
 * Fishing is one of the main reasons people drive to a lake, and the rules that matter are
 * a licence, a season, a size limit and a bag limit. All four are state law and all four
 * change every year, so this app does not restate them: it says a licence is required and
 * points at the agency that actually publishes them. Anything else would be a stale legal
 * claim about someone's fishing trip.
 *
 * Pure TS: no React, no DB.
 */

export interface FishingAgency {
  /** How the agency is normally referred to, for the link text. */
  agency: string;
  /** Current regulations, including seasons, size and bag limits. */
  regulationsUrl: string;
  /** Where to buy a licence. */
  licenceUrl: string;
}

/**
 * Only states the dataset actually covers. A state missing here renders nothing rather
 * than a guessed link: sending an angler to the wrong agency is worse than sending them
 * to a search engine themselves.
 */
const AGENCIES: Record<string, FishingAgency> = {
  FL: {
    agency: "Florida Fish and Wildlife Conservation Commission",
    regulationsUrl: "https://myfwc.com/fishing/freshwater/regulations/",
    licenceUrl: "https://myfwc.com/license/recreational/do-i-need-one/",
  },
  MI: {
    agency: "Michigan Department of Natural Resources",
    regulationsUrl: "https://www.michigan.gov/dnr/things-to-do/fishing/regulations",
    licenceUrl: "https://www.michigan.gov/dnr/buy-and-apply/licenses",
  },
  MN: {
    agency: "Minnesota Department of Natural Resources",
    regulationsUrl: "https://www.dnr.state.mn.us/regulations/fishing/index.html",
    licenceUrl: "https://www.dnr.state.mn.us/licenses/fishing/index.html",
  },
  WI: {
    agency: "Wisconsin Department of Natural Resources",
    regulationsUrl: "https://dnr.wisconsin.gov/topic/fishing/regulations",
    licenceUrl: "https://dnr.wisconsin.gov/topic/fishing/licenses",
  },
};

export function fishingAgency(state: string | null | undefined): FishingAgency | null {
  if (!state) return null;
  return AGENCIES[state.toUpperCase()] ?? null;
}

/**
 * Whether fishing is worth mentioning at all for this park.
 *
 * Springs are swim holes rather than fisheries, and several of the Florida ones prohibit
 * it outright, so the section is for lakes and rivers unless a park says otherwise.
 */
export function mentionsFishing(park: { type: string; state?: string | null }): boolean {
  return (park.type === "lake" || park.type === "river") && fishingAgency(park.state) !== null;
}
