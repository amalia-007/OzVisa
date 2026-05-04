import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

// Named export used in routes
export const stripe = {
  checkout: {
    sessions: {
      create: (...args: Parameters<Stripe["checkout"]["sessions"]["create"]>) =>
        getStripe().checkout.sessions.create(...args),
    },
  },
  webhooks: {
    constructEvent: (...args: Parameters<Stripe["webhooks"]["constructEvent"]>) =>
      getStripe().webhooks.constructEvent(...args),
  },
};

export const PRICE_IN_CENTS = 5500; // 55 AUD
export const CURRENCY = "aud";
