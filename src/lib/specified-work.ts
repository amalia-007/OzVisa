// Regional postcodes and areas for specified work eligibility (WHV 417/462)
// Source: https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work
// Official categories (verified Sep 2025):
//   1. Plant and animal cultivation (all farming / horticulture / agriculture subtypes)
//   2. Fishing and pearling
//   3. Tree farming and felling
//   4. Mining (includes mine-site security and mining services roles)
//   5. Construction (regional only)
//   6. Bushfire / flood / disaster recovery

// Plant and animal cultivation covers an enormous range of roles.
// We intentionally match broadly — any disqualifying industry check fires first.
export const SPECIFIED_WORK_TYPES = [
  // Plant and animal cultivation
  "plant and animal cultivation",
  "agriculture",
  "agricultural",
  "horticulture",
  "horticultural",
  "viticulture",
  "viticultural",
  "aquaculture",
  "farming",
  "farm work",
  "orchard",
  "fruit picking",
  "fruit packing",
  "fruit farm",
  "vegetable",
  "harvest",
  "harvesting",
  "crop",
  "dairy",
  "livestock",
  "poultry",
  "beekeeping",
  "apiculture",
  "plantation",
  "vineyard",
  "winery",
  "cane",
  "cotton",
  "grain",
  "wool",
  "shearing",
  "pruning",
  "picking",
  "planting",
  "seeding",
  "seasonal farm",
  "market garden",
  "mushroom",
  "flower farm",
  // Fishing and pearling
  "fishing",
  "pearling",
  "pearl farming",
  "pearl",
  // Tree farming and felling
  "tree felling",
  "tree farming",
  "logging",
  "forestry",
  "timber",
  "silviculture",
  // Mining (including mine-site security and labour hire for mines)
  "mining",
  "mine site",
  "mine work",
  "mineral",
  "quarry",
  "quarrying",
  "drilling",
  "mine site security",
  "mining security",
  "mining services",
  "goldfields",
  // Construction (regional enforcement is via postcode check)
  "construction",
  "building and construction",
  // Recovery work
  "bushfire recovery",
  "flood recovery",
  "disaster recovery",
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
  "child care",
  "office",
  "administration",
  "transport",
  "warehouse",
  "logistics",
  "healthcare",
  "aged care",
  "beauty",
  "hairdressing",
  "massage",
];

// Metropolitan postcode ranges — work here does NOT qualify as regional.
// Source: Department of Home Affairs — excluded metropolitan areas.
// Excludes: Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast (added Dec 2019).
const METRO_POSTCODES_RANGES: [number, number][] = [
  [2000, 2234], // Sydney metro
  [2555, 2574], // Southwest Sydney
  [2740, 2786], // Western Sydney
  [3000, 3207], // Melbourne metro
  [3335, 3341], // Melbourne northwest
  [3427, 3432], // Melbourne north
  [3750, 3811], // Melbourne northeast
  [3910, 3920], // Melbourne southeast
  [4000, 4179], // Brisbane metro
  [4300, 4305], // Ipswich (Brisbane metro)
  [4210, 4276], // Gold Coast (excluded since Dec 2019)
  [5000, 5174], // Adelaide metro
  [6000, 6214], // Perth metro
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

// Always returns a definitive true/false — never null.
// Default: ✅ for qualifying industries unless the postcode is explicitly metropolitan.
export function checkSpecifiedWorkEligibility(
  postcode: string | null,
  state: string | null,
  industry: string | null
): { eligible: boolean; reason: string; reasonFr: string } {
  const postcodeNum = postcode ? parseInt(postcode, 10) : null;
  const isMetro = postcodeNum !== null ? isMetroPostcode(postcodeNum) : false;

  const location = postcode ? `postcode ${postcode}` : state ?? null;
  const locationFr = postcode ? `code postal ${postcode}` : state ?? null;

  // Explicitly non-qualifying industry → ❌ immediately, regardless of location
  if (industry && isDisqualifyingIndustry(industry)) {
    return {
      eligible: false,
      reason: `"${industry}" does not qualify as specified work. Qualifying sectors: agriculture, horticulture, fishing, pearling, tree farming, mining, and construction. You need 88 days of regional specified work for a 2nd WHV (417).`,
      reasonFr: `"${industry}" ne qualifie pas comme travail spécifié. Secteurs qualifiants : agriculture, horticulture, pêche, perliculture, exploitation forestière, exploitation minière et construction. Il vous faut 88 jours de travail spécifié en zone régionale pour un 2ème WHV (417).`,
    };
  }

  // Metro postcode → ❌ regardless of industry
  if (isMetro) {
    return {
      eligible: false,
      reason: `Postcode ${postcode} is in a metropolitan area (Sydney, Melbourne, Brisbane, Perth, Adelaide or Gold Coast). Specified work must be done in regional Australia. 88 days of regional specified work required for a 2nd WHV (417).`,
      reasonFr: `Le code postal ${postcode} est en zone métropolitaine (Sydney, Melbourne, Brisbane, Perth, Adélaïde ou Gold Coast). Le travail spécifié doit être effectué dans l'Australie régionale. 88 jours de travail spécifié en zone régionale requis pour un 2ème WHV (417).`,
    };
  }

  // Qualifying industry + not metro → ✅
  if (industry && isQualifyingIndustry(industry)) {
    const locPhrase = location
      ? `and ${location} is in a regional area`
      : "and your work location is outside a major metropolitan area";
    const locPhraseFr = locationFr
      ? `et le ${locationFr} est en zone régionale`
      : "et votre lieu de travail est hors zone métropolitaine";
    return {
      eligible: true,
      reason: `"${industry}" qualifies as specified work ${locPhrase}. ✅ You need 88 days (≈ 3 months) for a 2nd WHV, or 179 days (≈ 6 months) for a 3rd WHV (subclass 417). Ensure you have payslips or an employer letter confirming exact start and end dates.`,
      reasonFr: `"${industry}" qualifie comme travail spécifié ${locPhraseFr}. ✅ Il vous faut 88 jours (≈ 3 mois) pour un 2ème WHV, ou 179 jours (≈ 6 mois) pour un 3ème WHV (sous-classe 417). Assurez-vous d'avoir des fiches de paie ou une lettre d'employeur confirmant vos dates exactes de début et fin.`,
    };
  }

  // Industry unknown or unrecognised → ❌ (cannot confirm qualifying work)
  return {
    eligible: false,
    reason: `Could not confirm qualifying specified work${industry ? ` ("${industry}" is not a recognised specified work category)` : ""}. Eligible sectors: agriculture, horticulture, viticulture, fishing, pearling, tree farming, mining, construction. You need 88 days in a regional area for a 2nd WHV (subclass 417).`,
    reasonFr: `Travail spécifié qualifiant non confirmé${industry ? ` ("${industry}" n'est pas une catégorie reconnue)` : ""}. Secteurs éligibles : agriculture, horticulture, viticulture, pêche, perliculture, exploitation forestière, exploitation minière, construction. Il vous faut 88 jours en zone régionale pour un 2ème WHV (sous-classe 417).`,
  };
}
