function calculateIncentive(websiteClosures) {
  const count = Number(websiteClosures) || 0;
  const firstSlab = Math.min(count, 20);
  const bonusSlab = Math.max(count - 20, 0);
  const amount = firstSlab * 200 + bonusSlab * 500;

  return {
    firstSlabCount: firstSlab,
    bonusSlabCount: bonusSlab,
    amount,
    unlockedBonusSlab: count > 20,
  };
}

module.exports = {
  calculateIncentive,
};
