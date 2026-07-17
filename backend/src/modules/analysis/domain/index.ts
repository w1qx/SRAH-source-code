/**
 * The analysis domain — the pure SAMA engine.
 *
 * Nothing in this folder imports Express, Prisma, the Anthropic SDK, or the clock.
 * If a function in here ever needs `await`, it is in the wrong layer.
 */
export * from './amortization';
export * from './assumptions';
export * from './messages';
export * from './money';
export * from './obligations';
export * from './preflight';
export * from './ratios';
export * from './risk-classifier';
export * from './safer-option';
export * from './sama-rules';
export * from './scenario-builder';
