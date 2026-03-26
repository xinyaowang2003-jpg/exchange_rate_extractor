export const INSTRUMENTS = [
  "AUDUSD", "EURUSD", "GBPUSD", "NZDUSD",
  "USDAED", "USDCAD", "USDCHF", "USDCNH",
  "USDCZK", "USDDKK", "USDHKD", "USDHUF",
  "USDILS", "USDJPY", "USDMXN", "USDNOK",
  "USDPLN", "USDRON", "USDSAR", "USDSEK",
  "USDSGD", "USDTHB", "USDTRY", "USDZAR",
];

export const JPY_PAIRS = new Set(["USDJPY"]);
export const POINT = (inst) => (JPY_PAIRS.has(inst) ? 1000 : 100000);
export const MIN_YEAR = 2021;
