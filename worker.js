'use strict';

// ===== Binomial Coefficients =====
const MAX_N = 200;
const binom = [];
for (let n = 0; n <= MAX_N; n++) {
    binom[n] = new Float64Array(12);
    binom[n][0] = 1;
    for (let k = 1; k <= Math.min(n, 11); k++) {
        binom[n][k] = binom[n - 1][k - 1] + binom[n - 1][k];
    }
}

function C(n, k) {
    if (k < 0 || k > n) return 0;
    if (n <= MAX_N && k <= 11) return binom[n][k];
    let result = 1;
    const m = Math.min(k, n - k);
    for (let i = 0; i < m; i++) {
        result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
}

// ===== Combinatorial Number System =====
// Maps sorted 0-indexed subsets to unique ranks in [0, C(n,t)-1]

function subsetRank(subset) {
    let rank = 0;
    for (let i = 0; i < subset.length; i++) {
        if (subset[i] >= i + 1) {
            rank += binom[subset[i]][i + 1];
        }
    }
    return rank;
}

function subsetUnrank(rank, t) {
    const subset = new Array(t);
    let r = rank;
    for (let i = t; i >= 1; i--) {
        let v = i - 1;
        while (binom[v + 1][i] <= r) v++;
        subset[i - 1] = v;
        r -= binom[v][i];
    }
    return subset;
}

// ===== Utility =====

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Get ranks of all t-subsets within a k-element ticket (sorted, 0-indexed)
function getContainedRanks(ticket, t) {
    const k = ticket.length;
    const ranks = [];
    const idx = new Array(t);
    for (let i = 0; i < t; i++) idx[i] = i;

    while (true) {
        const sub = new Array(t);
        for (let i = 0; i < t; i++) sub[i] = ticket[idx[i]];
        ranks.push(subsetRank(sub));

        let i = t - 1;
        while (i >= 0 && idx[i] === k - t + i) i--;
        if (i < 0) break;
        idx[i]++;
        for (let j = i + 1; j < t; j++) idx[j] = idx[j - 1] + 1;
    }
    return ranks;
}

// ===== Greedy Covering Design =====

function generateCovering(n, k, t) {
    if (t === 0) return [];

    const totalSubsets = C(n, t);
    const subsetsPerTicket = C(k, t);
    const lowerBound = Math.ceil(totalSubsets / subsetsPerTicket);

    postMessage({ type: 'info', lowerBound, totalSubsets, subsetsPerTicket });

    if (totalSubsets > 8000000) {
        postMessage({ type: 'warning', code: 'TOO_MANY_SUBSETS', params: { n: totalSubsets.toLocaleString() } });
    }

    // Coverage tracking with swap-based array for O(1) random access
    const covered = new Uint8Array(totalSubsets);
    let uncoveredCount = totalSubsets;

    const uncoveredArr = new Int32Array(totalSubsets);
    const posMap = new Int32Array(totalSubsets);
    for (let i = 0; i < totalSubsets; i++) {
        uncoveredArr[i] = i;
        posMap[i] = i;
    }

    function markCovered(rank) {
        if (covered[rank]) return;
        covered[rank] = 1;
        const pos = posMap[rank];
        uncoveredCount--;
        const swapRank = uncoveredArr[uncoveredCount];
        uncoveredArr[pos] = swapRank;
        uncoveredArr[uncoveredCount] = rank;
        posMap[swapRank] = pos;
        posMap[rank] = uncoveredCount;
    }

    const allNumbers = Array.from({ length: n }, (_, i) => i);
    const tickets = [];
    let lastProgressTime = Date.now();
    const numCandidates = Math.max(40, Math.min(200, Math.ceil(300000 / Math.max(1, totalSubsets) * 100)));

    while (uncoveredCount > 0) {
        // Pick a random uncovered t-subset
        const targetRank = uncoveredArr[Math.floor(Math.random() * uncoveredCount)];
        const targetSubset = subsetUnrank(targetRank, t);

        const targetSet = new Set(targetSubset);
        const remaining = allNumbers.filter(x => !targetSet.has(x));

        let bestTicket = null;
        let bestScore = -1;
        const attempts = Math.min(numCandidates, C(remaining.length, k - t));

        for (let c = 0; c < attempts; c++) {
            const need = k - t;
            for (let i = 0; i < need; i++) {
                const j = i + Math.floor(Math.random() * (remaining.length - i));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
            }

            const ticket = new Array(k);
            for (let i = 0; i < t; i++) ticket[i] = targetSubset[i];
            for (let i = 0; i < need; i++) ticket[t + i] = remaining[i];
            ticket.sort((a, b) => a - b);

            const ranks = getContainedRanks(ticket, t);
            let score = 0;
            for (const r of ranks) {
                if (!covered[r]) score++;
            }

            if (score > bestScore) {
                bestScore = score;
                bestTicket = ticket;
            }
        }

        tickets.push(bestTicket);

        const coveredRanks = getContainedRanks(bestTicket, t);
        for (const r of coveredRanks) markCovered(r);

        const now = Date.now();
        if (now - lastProgressTime > 200 || uncoveredCount === 0) {
            lastProgressTime = now;
            postMessage({
                type: 'progress',
                percent: 1 - uncoveredCount / totalSubsets,
                ticketCount: tickets.length,
                uncovered: uncoveredCount
            });
        }
    }

    return tickets;
}

// ===== Message Handler =====

self.onmessage = function (e) {
    const data = e.data;

    if (data.type === 'estimate') {
        const { mainPool, mainPick, mainGuarantee, bonusPool, bonusGuarantee } = data;

        if (mainGuarantee === 0 && bonusGuarantee === 0) {
            postMessage({ type: 'estimateResult', lowerBound: 0, estimatedRange: [0, 0], bonusMultiplier: 1, totalSubsets: 0 });
            return;
        }

        const totalSubsets = C(mainPool, mainGuarantee);
        const subsetsPerTicket = C(mainPick, mainGuarantee);
        const lb = Math.ceil(totalSubsets / subsetsPerTicket);
        const bonusMult = bonusGuarantee > 0 ? bonusPool : 1;

        postMessage({
            type: 'estimateResult',
            lowerBound: lb,
            totalSubsets,
            subsetsPerTicket,
            bonusMultiplier: bonusMult,
            estimatedTotal: lb * bonusMult,
            estimatedRange: [
                Math.ceil(lb * 1.0) * bonusMult,
                Math.ceil(lb * 2.5) * bonusMult
            ]
        });
    }

    if (data.type === 'sanityCheck') {
        const { tickets, mainPool, mainPick, mainGuarantee } = data;
        const n = mainPool;
        const t = mainGuarantee;
        const totalCombinations = C(n, t);

        // Build a Set of numbers for each ticket for fast lookup
        const ticketSets = tickets.map(ticket => new Set(ticket));

        let checked = 0;
        let missingCount = 0;
        let lastProgressTime = Date.now();

        // Enumerate all t-subsets of {0, 1, ..., n-1}
        const idx = new Array(t);
        for (let i = 0; i < t; i++) idx[i] = i;

        while (true) {
            // Check if any ticket contains all elements of this t-subset
            let found = false;
            for (let ti = 0; ti < ticketSets.length; ti++) {
                let allMatch = true;
                for (let j = 0; j < t; j++) {
                    if (!ticketSets[ti].has(idx[j])) {
                        allMatch = false;
                        break;
                    }
                }
                if (allMatch) {
                    found = true;
                    break;
                }
            }

            if (!found) missingCount++;
            checked++;

            // Progress update
            const now = Date.now();
            if (now - lastProgressTime > 200) {
                lastProgressTime = now;
                postMessage({
                    type: 'sanityProgress',
                    percent: checked / totalCombinations,
                    checked,
                    total: totalCombinations
                });
            }

            // Advance to next t-subset
            let i = t - 1;
            while (i >= 0 && idx[i] === n - t + i) i--;
            if (i < 0) break;
            idx[i]++;
            for (let j = i + 1; j < t; j++) idx[j] = idx[j - 1] + 1;
        }

        postMessage({
            type: 'sanityResult',
            passed: missingCount === 0,
            totalCombinations,
            missingCount
        });
    }

    if (data.type === 'generate') {
        try {
            const { mainPool, mainPick, mainGuarantee, bonusPool, bonusPick, bonusGuarantee } = data;

            if (mainGuarantee === 0 && bonusGuarantee === 0) {
                postMessage({ type: 'complete', tickets: [], bonusNumbers: [], mainCoveringSize: 0 });
                return;
            }
            if (mainGuarantee > mainPick) {
                postMessage({ type: 'error', code: 'GUARANTEE_EXCEEDS_PICK' });
                return;
            }
            if (mainGuarantee === mainPick) {
                const total = C(mainPool, mainPick);
                postMessage({ type: 'error', code: 'GUARANTEE_ALL_MATCHES', params: { k: mainPick, total: total.toLocaleString() } });
                return;
            }

            const mainTickets = generateCovering(mainPool, mainPick, mainGuarantee);

            let finalTickets = [];
            let finalBonus = [];

            if (bonusGuarantee > 0 && bonusPool > 0 && bonusPick > 0) {
                for (let b = 1; b <= bonusPool; b++) {
                    for (const ticket of mainTickets) {
                        finalTickets.push(ticket.map(x => x + 1));
                        finalBonus.push(b);
                    }
                }
                // Shuffle so tickets look random
                const idx = Array.from({ length: finalTickets.length }, (_, i) => i);
                shuffleArray(idx);
                finalTickets = idx.map(i => finalTickets[i]);
                finalBonus = idx.map(i => finalBonus[i]);
            } else {
                finalTickets = mainTickets.map(t => t.map(x => x + 1));
                if (bonusPool > 0 && bonusPick > 0) {
                    finalBonus = mainTickets.map(() => Math.floor(Math.random() * bonusPool) + 1);
                }
            }

            postMessage({
                type: 'complete',
                tickets: finalTickets,
                bonusNumbers: finalBonus,
                mainCoveringSize: mainTickets.length
            });

        } catch (err) {
            if (err.message !== 'abort') {
                postMessage({ type: 'error', message: err.message });
            }
        }
    }
};
