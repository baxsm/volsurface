import type { Contract } from "@/lib/types";

export const contract = (overrides: Partial<Contract> = {}): Contract => ({
  contractId: "IBM260724C00212500",
  type: "call",
  strike: 212.5,
  bid: 6.85,
  ask: 7.15,
  last: 7.1,
  mark: 7,
  volume: 1075,
  openInterest: 654,
  vendorIv: 0.7563,
  computedIv: 0.7497,
  greeks: { delta: 0.5316, gamma: 0.02377, theta: -306.5638, vega: 8.8708, rho: 1.1647 },
  ivConverged: true,
  ...overrides,
});

/** a small ladder either side of a 212.50 spot */
export const ladder = (): Contract[] => [
  contract({ contractId: "c-205", type: "call", strike: 205, computedIv: 0.763 }),
  contract({ contractId: "p-205", type: "put", strike: 205, computedIv: 0.732 }),
  contract({ contractId: "c-212", type: "call", strike: 212.5 }),
  contract({ contractId: "p-212", type: "put", strike: 212.5, computedIv: 0.75 }),
  contract({ contractId: "c-220", type: "call", strike: 220, computedIv: 0.758 }),
  contract({ contractId: "p-220", type: "put", strike: 220, computedIv: 0.764 }),
];
