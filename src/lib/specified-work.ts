// Regional postcodes and areas for specified work eligibility (WHV 417/462)
// Source: https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work

// OFFICIAL specified work categories per IMHA — ONLY these count
export const SPECIFIED_WORK_TYPES = [
  "plant and animal cultivation",
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

// Industries that explicitly do NOT qualify as specified work
const NON_QUALIFYING_INDUSTRIES = [
  "hospitality",
  "restaurant",
  "café",
  "cafe",
  "bar",
  "hotel",
  "tourism",
  "retail",
  "shop",
  "store",
  "supermarket",
  "cleaning",
  "domestic",
  "childcare",
  "office",
  "administration",
  "transport",
  "warehouse",
  "logistics",
  "healthcare",
  "aged care",
];

// Metropolitan postcode ranges — work in these areas does NOT qualify as regional.
// Source: Department of Home Affairs — excluded metropolitan areas.
// Excluded: Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast (added Dec 2019).
const METRO_POSTCODES_RANGES: [number, number][] = [
  [2000, 2234],   // Sydney metro
  [2555, 2574],   // Southwest Sydney
  [2740, 2786],   // Western Sydney
  [3000, 3207],   // Melbourne metro
  [3335, 3341],   // Melbourne northwest
  [3427, 3432],   // Melbourne north
  [3750, 3811],   // Melbourne northeast
  [3910, 3920],   // Melbourne southeast
  [4000, 4179],   // Brisbane metro
  [4300, 4305],   // Ipswich (Brisbane metro)
  [4210, 4276],   // Gold Coast (excluded since Dec 2019)
  [5000, 5174],   // Adelaide metro
  [6000, 6214],   // Perth metro
];

function isMetroPostcode(postcode: number): boolean {
  return METRO_POSTCODES_RANGES.some(([min, max]) => postcode >= min && postcode <= max);
}

function isQualifyingIndustry(industry: string): boolean {
  const lower = industry.toLowerCase();
  return SPECIFIED_WORK_TYPES.some((t) => lower.includes(t));
}

function isDisqualifyingIndustry(industry: string): boolean {
  const lower = industry.toLowerCase();
  return NON_QUALIFYING_INDUSTRIES.some((t) => lower.includes(t));
}

export function checkSpecifiedWorkEligibility(
  postcode: string | null,
  state: string | null,
  industry: string | null
): { eligible: boolean | null; reason: string; reasonFr: string } {
  if (!postcode && !state && !industry) {
    return {
      eligible: null,
      reason: "Insufficient information to determine eligibility.",
      reasonFr: "Informations insuffisantes pour déterminer l'éligibilité.",
    };
  }

  const postcodeNum = postcode ? parseInt(postcode, 10) : null;
  const isMetro = postcodeNum ? isMetroPostcode(postcodeNum) : null;
  const isRegional = isMetro === null ? null : !isMetro;

  // Explicitly non-qualifying industry
  if (industry && isDisqualifyingIndustry(industry)) {
    return {
      eligible: false,
      reason: `"${industry}" does not qualify as specified work. Only plant/animal cultivation, fishing & pearling, tree farming & felling, mining, and construction count toward WHV renewal. You need 88 days (≈ 3 months) of qualifying specified work in a regional area for a 2nd WHV (417).`,
      reasonFr: `"${industry}" ne qualifie pas comme travail spécifié. Seuls la culture végétale/animale, la pêche et perliculture, l'abattage forestier, l'exploitation minière et la construction comptent pour le renouvellement du WHV. Il vous faut 88 jours (≈ 3 mois) de travail spécifié en zone régionale pour un 2ème WHV (417).`,
    };
  }

  // Metro location
  if (isMetro) {
    return {
      eligible: false,
      reason: `Postcode ${postcode} is in a metropolitan area (Sydney, Melbourne, Brisbane, Perth, Adelaide or Gold Coast). Specified work must be done in regional Australia. You need 88 days of regional specified work for a 2nd WHV (417).`,
      reasonFr: `Le code postal ${postcode} est en zone métropolitaine (Sydney, Melbourne, Brisbane, Perth, Adélaïde ou Gold Coast). Le travail spécifié doit être effectué dans l'Australie régionale. Il vous faut 88 jours de travail spécifié en zone régionale pour un 2ème WHV (417).`,
    };
  }

  const qualifies = industry ? isQualifyingIndustry(industry) : null;

  // Qualifying industry + regional
  if (qualifies && (isRegional === true || (isRegional === null && state))) {
    const location = postcode ? `postcode ${postcode}` : state ?? "your location";
    const locationFr = postcode ? `code postal ${postcode}` : state ?? "votre lieu de travail";
    return {
      eligible: true,
      reason: `"${industry}" qualifies as specified work and ${location} is in a regional area. ✅ You need a total of 88 days (≈ 3 months) for a 2nd WHV, or 179 days (≈ 6 months) for a 3rd WHV (subclass 417). Ensure you have payslips or an employer letter confirming your exact start and end dates.`,
      reasonFr: `"${industry}" qualifie comme travail spécifié et le ${locationFr} est en zone régionale. ✅ Il vous faut 88 jours au total (≈ 3 mois) pour un 2ème WHV, ou 179 jours (≈ 6 mois) pour un 3ème WHV (sous-classe 417). Assurez-vous d'avoir des fiches de paie ou une lettre d'employeur confirmant vos dates exactes de début et fin.`,
    };
  }

  // Unknown industry, confirmed regional
  if (!industry && isRegional === true) {
    return {
      eligible: null,
      reason: `Your work location (postcode ${postcode}) is regional, but the industry sector could not be confirmed. To qualify, your work must be in: agriculture, horticulture, fishing, mining, or construction. 88 days required for a 2nd WHV.`,
      reasonFr: `Votre lieu de travail (code postal ${postcode}) est en zone régionale, mais le secteur d'activité n'a pas pu être confirmé. Pour être éligible, votre travail doit être dans : agriculture, horticulture, pêche, exploitation minière ou construction. 88 jours requis pour un 2ème WHV.`,
    };
  }

  // Industry unknown or location unknown
  return {
    eligible: null,
    reason: `Could not fully determine eligibility — industry or location unclear. Eligible sectors: agriculture, horticulture, viticulture, fishing, pearling, tree farming, mining, construction. You need 88 days in a regional area for a 2nd WHV (subclass 417).`,
    reasonFr: `Éligibilité impossible à déterminer entièrement — secteur ou lieu non identifié. Secteurs éligibles : agriculture, horticulture, viticulture, pêche, perliculture, exploitation forestière, exploitation minière, construction. Il vous faut 88 jours en zone régionale pour un 2ème WHV (sous-classe 417).`,
  };
}
