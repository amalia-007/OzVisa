// Regional postcodes and areas for specified work eligibility (WHV 417/462)
// Source: https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work

export const REGIONAL_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"];

// Eligible industries for specified work
export const SPECIFIED_WORK_INDUSTRIES = [
  "agriculture",
  "horticulture",
  "viticulture",
  "aquaculture",
  "farming",
  "fishing",
  "pearling",
  "tree felling",
  "tree farming",
  "mining",
  "construction",
  "bushfire recovery",
  "flood recovery",
];

// Postcodes explicitly listed as regional/remote areas
// These are areas outside major metropolitan areas
const METRO_POSTCODES_RANGES: [number, number][] = [
  [2000, 2234],   // Sydney metro
  [2555, 2574],   // Southwest Sydney
  [2740, 2786],   // Western Sydney
  [3000, 3207],   // Melbourne metro
  [3335, 3341],   // Melbourne northwest
  [3427, 3432],   // Melbourne
  [3750, 3811],   // Melbourne northeast
  [3910, 3920],   // Melbourne southeast
  [4000, 4179],   // Brisbane metro
  [4300, 4305],   // Ipswich
  [5000, 5174],   // Adelaide metro
  [6000, 6214],   // Perth metro
];

function isMetroPostcode(postcode: number): boolean {
  return METRO_POSTCODES_RANGES.some(([min, max]) => postcode >= min && postcode <= max);
}

export function checkSpecifiedWorkEligibility(
  postcode: string | null,
  state: string | null,
  industry: string | null
): { eligible: boolean | null; reason: string } {
  if (!postcode && !state && !industry) {
    return {
      eligible: null,
      reason: "Insufficient information to determine eligibility.",
    };
  }

  const industryLower = industry?.toLowerCase() || "";
  const isEligibleIndustry = SPECIFIED_WORK_INDUSTRIES.some((ind) =>
    industryLower.includes(ind)
  );

  const postcodeNum = postcode ? parseInt(postcode, 10) : null;
  const isRegional = postcodeNum ? !isMetroPostcode(postcodeNum) : null;

  if (isEligibleIndustry && (isRegional === true || isRegional === null)) {
    return {
      eligible: true,
      reason: `Your industry (${industry}) qualifies as specified work and your location appears to be in a regional area.`,
    };
  }

  if (!isEligibleIndustry && industry) {
    return {
      eligible: false,
      reason: `Your industry (${industry}) is not listed as specified work for WHV renewal. Eligible industries include agriculture, horticulture, mining, and construction.`,
    };
  }

  if (isRegional === false) {
    return {
      eligible: false,
      reason: `Your work location (postcode ${postcode}) appears to be in a metropolitan area. Specified work must be performed in regional or remote Australia.`,
    };
  }

  return {
    eligible: null,
    reason: "Unable to fully determine eligibility. Please verify your industry and location on the official website.",
  };
}
