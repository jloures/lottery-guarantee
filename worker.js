'use strict';

// ===== Binomial Coefficients =====
const MAX_N = 200;
const MAX_K = MAX_N;
const binom = [];
for (let n = 0; n <= MAX_N; n++) {
    binom[n] = new Float64Array(MAX_K + 1);
    binom[n][0] = 1;
    for (let k = 1; k <= n; k++) {
        binom[n][k] = binom[n - 1][k - 1] + binom[n - 1][k];
    }
}

function C(n, k) {
    if (k < 0 || k > n) return 0;
    if (n <= MAX_N && k <= MAX_K) return binom[n][k];
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

// ===== Chunked Bit Set for Large Coverage Tracking =====
// Typed arrays crash when totalSubsets exceeds ~2 billion (RangeError).
// This class allocates memory in small chunks (4 MB each) on demand,
// allowing coverage tracking for arbitrarily large subset counts.

class ChunkedBitSet {
    constructor(size) {
        this.size = size;
        this.CHUNK_BITS = 1 << 25; // 32M bits = 4 MB per chunk
        this.CHUNK_WORDS = this.CHUNK_BITS >>> 5;
        this.numChunks = Math.ceil(size / this.CHUNK_BITS);
        this.chunks = new Array(this.numChunks).fill(null);
        this.chunkCovered = new Float64Array(this.numChunks);
        this.count = 0;
    }

    has(index) {
        const ci = Math.floor(index / this.CHUNK_BITS);
        const chunk = this.chunks[ci];
        if (!chunk) return false;
        const local = index - ci * this.CHUNK_BITS;
        return (chunk[local >>> 5] & (1 << (local & 31))) !== 0;
    }

    add(index) {
        const ci = Math.floor(index / this.CHUNK_BITS);
        if (!this.chunks[ci]) {
            this.chunks[ci] = new Uint32Array(this.CHUNK_WORDS);
        }
        const local = index - ci * this.CHUNK_BITS;
        const word = local >>> 5;
        const bit = 1 << (local & 31);
        if (this.chunks[ci][word] & bit) return false;
        this.chunks[ci][word] |= bit;
        this.chunkCovered[ci]++;
        this.count++;
        return true;
    }

    _chunkSize(ci) {
        return ci < this.numChunks - 1
            ? this.CHUNK_BITS
            : this.size - ci * this.CHUNK_BITS;
    }

    randomUncovered() {
        const uncovered = this.size - this.count;
        let target = Math.floor(Math.random() * uncovered);
        for (let ci = 0; ci < this.numChunks; ci++) {
            const cu = this._chunkSize(ci) - this.chunkCovered[ci];
            if (target < cu) return this._pickInChunk(ci);
            target -= cu;
        }
        return 0;
    }

    _pickInChunk(ci) {
        const cs = this._chunkSize(ci);
        const base = ci * this.CHUNK_BITS;
        const chunk = this.chunks[ci];
        if (!chunk) return base + Math.floor(Math.random() * cs);

        // Fast path: rejection sampling when many uncovered
        if (this.chunkCovered[ci] < cs * 0.99) {
            let local;
            do {
                local = Math.floor(Math.random() * cs);
            } while (chunk[local >>> 5] & (1 << (local & 31)));
            return base + local;
        }

        // Slow path: scan words for an uncovered bit
        const words = Math.ceil(cs / 32);
        const startWord = Math.floor(Math.random() * words);
        for (let i = 0; i < words; i++) {
            const wi = (startWord + i) % words;
            if (chunk[wi] === 0xFFFFFFFF) continue;
            for (let b = 0; b < 32; b++) {
                const idx = wi * 32 + b;
                if (idx < cs && !(chunk[wi] & (1 << b))) return base + idx;
            }
        }
        return base;
    }
}

// ===== Greedy Covering Design =====

// Flat arrays: fast O(1) operations, but limited to ~300M subsets
// due to typed array length limits and memory.
const FLAT_LIMIT = 300_000_000;

function generateCovering(n, k, t) {
    if (t === 0) return [];

    const totalSubsets = C(n, t);
    const subsetsPerTicket = C(k, t);
    const lowerBound = Math.ceil(totalSubsets / subsetsPerTicket);

    postMessage({ type: 'info', lowerBound, totalSubsets, subsetsPerTicket });

    if (totalSubsets > 8000000) {
        postMessage({ type: 'warning', code: 'TOO_MANY_SUBSETS', params: { n: totalSubsets.toLocaleString() } });
    }

    if (totalSubsets <= FLAT_LIMIT) {
        try {
            return generateCoveringFlat(n, k, t, totalSubsets);
        } catch (e) {
            // Allocation failed; fall through to chunked
        }
    }
    return generateCoveringChunked(n, k, t, totalSubsets);
}

function generateCoveringFlat(n, k, t, totalSubsets) {
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

function generateCoveringChunked(n, k, t, totalSubsets) {
    const bitSet = new ChunkedBitSet(totalSubsets);

    const allNumbers = Array.from({ length: n }, (_, i) => i);
    const tickets = [];
    let lastProgressTime = Date.now();
    const numCandidates = Math.max(40, Math.min(200, Math.ceil(300000 / Math.max(1, totalSubsets) * 100)));

    while (bitSet.count < totalSubsets) {
        const targetRank = bitSet.randomUncovered();
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
                if (!bitSet.has(r)) score++;
            }

            if (score > bestScore) {
                bestScore = score;
                bestTicket = ticket;
            }
        }

        tickets.push(bestTicket);

        const coveredRanks = getContainedRanks(bestTicket, t);
        for (const r of coveredRanks) bitSet.add(r);

        const now = Date.now();
        if (now - lastProgressTime > 200 || bitSet.count === totalSubsets) {
            lastProgressTime = now;
            const uncovered = totalSubsets - bitSet.count;
            postMessage({
                type: 'progress',
                percent: bitSet.count / totalSubsets,
                ticketCount: tickets.length,
                uncovered
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

        // Mark coverage by iterating tickets (not subsets).
        // Each ticket covers C(k, t) subsets — far fewer than C(n, t) total.
        // Use flat array for small problems, chunked bit set for large ones.
        let coveredCount = 0;
        let hasCovered, addCovered;

        if (totalCombinations <= FLAT_LIMIT) {
            try {
                const arr = new Uint8Array(totalCombinations);
                hasCovered = r => arr[r];
                addCovered = r => { arr[r] = 1; };
            } catch (e) { /* fall through to chunked */ }
        }
        if (!hasCovered) {
            const bitSet = new ChunkedBitSet(totalCombinations);
            hasCovered = r => bitSet.has(r);
            addCovered = r => bitSet.add(r);
        }

        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i].slice().sort((a, b) => a - b);
            const ranks = getContainedRanks(ticket, t);
            for (const r of ranks) {
                if (!hasCovered(r)) {
                    addCovered(r);
                    coveredCount++;
                }
            }

            if ((i & 63) === 0 || i === tickets.length - 1) {
                postMessage({
                    type: 'sanityProgress',
                    percent: coveredCount / totalCombinations,
                    checked: coveredCount,
                    total: totalCombinations
                });
            }
        }

        postMessage({
            type: 'sanityResult',
            passed: coveredCount === totalCombinations,
            totalCombinations,
            missingCount: totalCombinations - coveredCount
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
            let mainTickets;
            if (mainGuarantee === mainPick) {
                // Full guarantee requires all C(n,k) combinations
                const total = C(mainPool, mainPick);
                mainTickets = [];
                for (let r = 0; r < total; r++) {
                    mainTickets.push(subsetUnrank(r, mainPick));
                    if (r % 1000 === 0) {
                        postMessage({ type: 'progress', percent: r / total, ticketCount: r, uncovered: total - r });
                    }
                }
            } else {
                mainTickets = generateCovering(mainPool, mainPick, mainGuarantee);
            }

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
