/**
 * Tier Calculator
 * Calculates player tiers based on KDA and Damage
 * Ported from PvpPlayerInfo C# plugin v1.12
 */

class TierCalculator {
    constructor() {
        // Tier thresholds (score-based, not percentile)
        this.tierCutoffs = {
            T0: 95,  // Score >= 95
            T1: 90,  // Score >= 90
            T2: 75,  // Score >= 75
            T3: 50,  // Score >= 50
            T4: 25,  // Score >= 25
            T5: 0    // Score < 25
        };

        // Weights for tier score calculation (no match count)
        this.weights = {
            kda: 0.50,
            damage: 0.50
        };

        // Minimum matches to qualify for tier
        this.minMatches = 1;

        // Confidence weighting target matches
        this.targetMatches = 3;
        this.averageScore = 50.0;
    }

    /**
     * Calculate tiers for all players
     * @param {Array} players - Array of player objects
     * @returns {Array} Players with tier information added
     */
    calculateTiers(players) {
        // Filter players with minimum data
        const qualifiedPlayers = players.filter(p => p.flMatches >= this.minMatches);

        if (qualifiedPlayers.length === 0) {
            return players;
        }

        // Calculate distributions for percentile calculations
        const kdaValues = qualifiedPlayers.map(p => p.kda).sort((a, b) => a - b);
        const dmgValues = qualifiedPlayers.map(p => p.weightedAvgDamage || p.avgDamage).sort((a, b) => a - b);

        // Calculate tier scores for each player with confidence weighting
        qualifiedPlayers.forEach(player => {
            const kdaPercentile = this.getPercentile(player.kda, kdaValues);
            const dmgPercentile = this.getPercentile(player.weightedAvgDamage || player.avgDamage, dmgValues);

            // Raw score: KDA 50% + Damage 50%
            const rawScore = (
                kdaPercentile * this.weights.kda +
                dmgPercentile * this.weights.damage
            ) * 100;

            // Apply confidence weighting
            const confidence = Math.min(player.flMatches / this.targetMatches, 1.0);
            player.tierScore = (rawScore * confidence) + (this.averageScore * (1 - confidence));
        });

        // Sort by tier score to determine rank
        const sortedByScore = [...qualifiedPlayers].sort((a, b) => b.tierScore - a.tierScore);

        // Assign tiers based on score (not percentile)
        sortedByScore.forEach((player, index) => {
            player.tier = this.getTierFromScore(player.tierScore);
            player.tierRank = index + 1;
        });

        // Set tier to null for players without enough matches
        players.forEach(player => {
            if (player.flMatches < this.minMatches) {
                player.tier = null;
                player.tierScore = 0;
                player.tierRank = null;
            }
        });

        return players;
    }

    /**
     * Get the percentile of a value in a sorted array
     * @param {number} value - The value to find percentile for
     * @param {Array} sortedValues - Sorted array of all values
     * @returns {number} Percentile (0-1)
     */
    getPercentile(value, sortedValues) {
        if (sortedValues.length === 0) return 0.5;

        // Find the last index where array value <= input value
        let rank = 0;
        for (let i = sortedValues.length - 1; i >= 0; i--) {
            if (sortedValues[i] <= value) {
                rank = i + 1;
                break;
            }
        }

        return rank / sortedValues.length;
    }

    /**
     * Get tier name from score
     * @param {number} score - Tier score (0-100)
     * @returns {string} Tier name (T0-T5)
     */
    getTierFromScore(score) {
        if (score >= this.tierCutoffs.T0) return 'T0';
        if (score >= this.tierCutoffs.T1) return 'T1';
        if (score >= this.tierCutoffs.T2) return 'T2';
        if (score >= this.tierCutoffs.T3) return 'T3';
        if (score >= this.tierCutoffs.T4) return 'T4';
        return 'T5';
    }

    /**
     * Get CSS class for tier
     * @param {string} tier - Tier name
     * @returns {string} CSS class
     */
    getTierClass(tier) {
        if (!tier) return 'tier-none';
        return `tier-${tier.toLowerCase()}`;
    }

    /**
     * Get color class for KDA value based on percentile
     * @param {number} kda - Player's KDA
     * @param {Array} allKdaValues - All KDA values for comparison
     * @returns {string} CSS class (high, mid, low)
     */
    getKdaClass(kda, allKdaValues) {
        if (!allKdaValues || allKdaValues.length === 0) return '';

        const percentile = this.getPercentile(kda, allKdaValues.sort((a, b) => a - b));

        if (percentile >= 0.7) return 'high';
        if (percentile >= 0.4) return 'mid';
        if (percentile >= 0.7) return 'high';
        if (percentile >= 0.4) return 'mid';
        return 'low';
    }

    /**
     * Get CSS class for score value
     * @param {number} score - Tier score (0-100)
     * @returns {string} CSS class
     */
    getScoreClass(score) {
        if (!score && score !== 0) return 'tier-none'; // Handle null/undefined
        if (score >= 90) return 'tier-t0'; // Orange
        if (score >= 75) return 'tier-t1'; // Purple
        if (score >= 50) return 'tier-t2'; // Blue
        if (score >= 25) return 'tier-t3'; // Green
        return 'tier-t4';                  // Grey
    }

    /**
     * Get color class for damage value based on percentile
     * @param {number} damage - Player's average damage
     * @param {Array} allDamageValues - All damage values for comparison
     * @returns {string} CSS class (high, mid, low)
     */
    getDamageClass(damage, allDamageValues) {
        if (!allDamageValues || allDamageValues.length === 0) return '';

        const percentile = this.getPercentile(damage, allDamageValues.sort((a, b) => a - b));

        if (percentile >= 0.7) return 'high';
        if (percentile >= 0.4) return 'mid';
        return 'low';
    }
}

// Export for use in app.js
window.TierCalculator = TierCalculator;
