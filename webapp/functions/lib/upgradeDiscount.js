function calculateUpgradeBasisPoints(paidMinor, paidCurrency, targetMajor, targetCurrency) {
  if (!['USD', 'EUR', 'INR'].includes(paidCurrency) || paidCurrency !== targetCurrency ||
      !Number.isSafeInteger(paidMinor) || paidMinor <= 0 ||
      !Number.isFinite(targetMajor) || targetMajor <= 0) return null;
  return Math.min(9990, Math.max(10, Math.round((paidMinor / 100 / targetMajor) * 10000)));
}

module.exports = { calculateUpgradeBasisPoints };
