'use strict';

// ===== State =====
const S = {
    mainPool: 60,
    mainPick: 6,
    bonusEnabled: false,
    bonusPool: 12,
    bonusPick: 1,
    mainGuarantee: 3,
    bonusGuarantee: 0,
    ticketCost: 2.00,
    tickets: [],
    bonusNumbers: [],
    page: 0,
    pageSize: 50,
    prizeTiers: []
};

let worker = null;

// ===== DOM =====
const $ = id => document.getElementById(id);
const dom = {};

const SUPPORTED_LANGS = ['en', 'pt', 'es', 'fr', 'de', 'zh'];

document.addEventListener('DOMContentLoaded', () => {
    [
        'mainPick', 'mainPool', 'bonusEnabled', 'bonusPick', 'bonusPool',
        'bonusFields', 'lotterySummary', 'configWarning', 'mainGuarantee', 'bonusGuarantee',
        'mainFieldLabel', 'bonusFieldLabel', 'bonusGuaranteeRow', 'ticketCost',
        'estimateBox', 'warningBox', 'btnEstimate', 'btnGenerate', 'btnCancel',
        'progressBox', 'progressFill', 'progressText', 'errorBox',
        'ticketsSection', 'ticketCount', 'ticketCountLabel', 'totalCostLabel',
        'totalCost', 'btnDownload',
        'ticketsDisplay', 'btnPrev', 'btnNext', 'pageInfo',
        'btnSanityCheck', 'sanityCheckInfo', 'sanityProgressBox',
        'sanityProgressFill', 'sanityProgressText',
        'sanityBadge', 'sanityBadgeTitle', 'sanityBadgeDetail',
        'sanityFailBadge', 'sanityFailTitle', 'sanityFailDetail',
        'simulationSection', 'winningMain', 'winningBonus', 'winningBonusGroup',
        'prizeTiers', 'btnAddTier', 'btnSimulate', 'simResults', 'resultsContent',
        'langSelect'
    ].forEach(id => { dom[id] = $(id); });

    // Read initial state from DOM (handles browser form restoration)
    S.mainPick = +dom.mainPick.value;
    S.mainPool = +dom.mainPool.value;
    S.bonusEnabled = dom.bonusEnabled.checked;
    S.bonusPool = +dom.bonusPool.value;
    S.bonusPick = +dom.bonusPick.value;
    S.mainGuarantee = +dom.mainGuarantee.value;
    S.bonusGuarantee = +dom.bonusGuarantee.value;
    S.ticketCost = +dom.ticketCost.value;

    // Language detection
    const saved = localStorage.getItem('lottery-lang');
    const browser = (navigator.language || '').slice(0, 2);
    const lang = SUPPORTED_LANGS.includes(saved) ? saved
               : SUPPORTED_LANGS.includes(browser) ? browser
               : 'en';
    dom.langSelect.value = lang;
    setLocale(lang);

    initWorker();
    bindEvents();
    syncUI();
    generateDefaultTiers();
});

// ===== Worker =====
function initWorker() {
    if (worker) worker.terminate();
    try {
        worker = new Worker('worker.js');
        worker.onerror = (e) => { e.preventDefault(); initWorkerFallback(); };
        worker.onmessage = onWorkerMessage;
    } catch (err) {
        initWorkerFallback();
    }
}

function initWorkerFallback() {
    fetch('worker.js')
        .then(r => r.text())
        .then(code => {
            const blob = new Blob([code], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(blob));
            worker.onmessage = onWorkerMessage;
            worker.onerror = () => showError(t('error.workerFailed'));
        })
        .catch(() => showError(t('error.workerLoadFailed')));
}

function onWorkerMessage(e) {
    const d = e.data;
    if (d.type === 'estimateResult') showEstimate(d);
    if (d.type === 'progress') updateProgress(d.percent, d.ticketCount, d.uncovered);
    if (d.type === 'complete') onComplete(d);
    if (d.type === 'warning') {
        const msg = d.code ? t('warning.' + d.code, d.params || {}) : d.message;
        dom.warningBox.textContent = msg;
        dom.warningBox.hidden = false;
    }
    if (d.type === 'sanityProgress') updateSanityProgress(d);
    if (d.type === 'sanityResult') showSanityResult(d);
    if (d.type === 'error') {
        const msg = d.code ? t('error.' + d.code, d.params || {}) : d.message;
        showError(msg);
    }
}

// ===== Event Binding =====
function bindEvents() {
    dom.mainPick.addEventListener('input', () => { S.mainPick = Math.max(2, +dom.mainPick.value || 2); syncUI(); });
    dom.mainPool.addEventListener('input', () => { S.mainPool = Math.max(3, +dom.mainPool.value || 3); syncUI(); });
    dom.bonusEnabled.addEventListener('change', () => { S.bonusEnabled = dom.bonusEnabled.checked; syncUI(); });
    dom.bonusPool.addEventListener('input', () => { S.bonusPool = Math.max(2, +dom.bonusPool.value || 2); syncUI(); });
    dom.bonusPick.addEventListener('input', () => { S.bonusPick = Math.max(1, +dom.bonusPick.value || 1); syncUI(); });
    dom.mainGuarantee.addEventListener('input', () => { S.mainGuarantee = +dom.mainGuarantee.value; syncUI(); });
    dom.bonusGuarantee.addEventListener('input', () => { S.bonusGuarantee = +dom.bonusGuarantee.value; });
    dom.ticketCost.addEventListener('input', () => { S.ticketCost = +dom.ticketCost.value || 0; });

    dom.btnEstimate.addEventListener('click', requestEstimate);
    dom.btnGenerate.addEventListener('click', requestGenerate);
    dom.btnCancel.addEventListener('click', cancelGeneration);
    dom.btnDownload.addEventListener('click', downloadCSV);
    dom.btnSanityCheck.addEventListener('click', requestSanityCheck);
    dom.btnAddTier.addEventListener('click', () => addTierRow(0, false, 0));
    dom.btnSimulate.addEventListener('click', runSimulation);

    dom.langSelect.addEventListener('change', () => {
        setLocale(dom.langSelect.value);
        syncUI();
        generateDefaultTiers();
        if (S.tickets.length > 0) {
            updateTicketHeader();
            renderTickets();
        }
    });
}

// ===== UI Sync =====
function syncUI() {
    dom.mainGuarantee.max = S.mainPick - 1;
    if (S.mainGuarantee >= S.mainPick) {
        S.mainGuarantee = S.mainPick - 1;
        dom.mainGuarantee.value = S.mainGuarantee;
    }
    if (S.mainGuarantee < 1) {
        S.mainGuarantee = 1;
        dom.mainGuarantee.value = 1;
    }

    dom.bonusGuarantee.max = S.bonusPick;

    dom.bonusFields.style.display = S.bonusEnabled ? 'flex' : 'none';
    dom.bonusGuaranteeRow.style.display = S.bonusEnabled ? 'flex' : 'none';
    dom.winningBonusGroup.style.display = S.bonusEnabled ? 'block' : 'none';

    // Dynamic labels
    dom.mainFieldLabel.innerHTML = t('label.ofMainNumbers', { n: `<strong>${S.mainPick}</strong>` });
    dom.bonusFieldLabel.innerHTML = t('label.ofBonusNumbers', { n: `<strong>${S.bonusPick}</strong>` });

    // Summary
    const summary = S.bonusEnabled
        ? t('summary.pickBonus', { mainPick: S.mainPick, mainPool: S.mainPool, bonusPick: S.bonusPick, bonusPool: S.bonusPool })
        : t('summary.pick', { mainPick: S.mainPick, mainPool: S.mainPool });
    dom.lotterySummary.textContent = summary;

    // Performance warning for large pools
    if (S.mainPool > 70 || (S.bonusEnabled && S.bonusPool > 50)) {
        dom.configWarning.textContent = t('warning.largePool');
        dom.configWarning.hidden = false;
    } else {
        dom.configWarning.hidden = true;
    }

    dom.estimateBox.hidden = true;
    dom.warningBox.hidden = true;
    dom.errorBox.hidden = true;
}

// ===== Estimate =====
function requestEstimate() {
    worker.postMessage({
        type: 'estimate',
        mainPool: S.mainPool,
        mainPick: S.mainPick,
        mainGuarantee: S.mainGuarantee,
        bonusPool: S.bonusEnabled ? S.bonusPool : 0,
        bonusPick: S.bonusEnabled ? S.bonusPick : 0,
        bonusGuarantee: S.bonusEnabled ? S.bonusGuarantee : 0
    });
}

function showEstimate(d) {
    const lo = d.estimatedRange[0];
    const hi = d.estimatedRange[1];
    const cost = S.ticketCost;
    const flo = formatMoney(lo * cost);
    const fhi = formatMoney(hi * cost);

    dom.estimateBox.innerHTML = `
        <p>${t('estimate.lowerBound', { n: formatNumber(d.lowerBound) })}</p>
        ${d.bonusMultiplier > 1 ? `<p>${t('estimate.bonusMultiplier', { n: d.bonusMultiplier })}</p>` : ''}
        <p>${t('estimate.range', { lo: formatNumber(lo), hi: formatNumber(hi) })}</p>
        <p>${t('estimate.cost', { lo: flo, hi: fhi })}</p>
    `;
    dom.estimateBox.hidden = false;

    if (lo > 100000) {
        dom.warningBox.textContent = t('warning.large', { n: formatNumber(lo) });
        dom.warningBox.hidden = false;
    } else {
        dom.warningBox.hidden = true;
    }
    dom.errorBox.hidden = true;
}

// ===== Generate =====
function requestGenerate() {
    dom.errorBox.hidden = true;
    dom.ticketsSection.hidden = true;
    dom.simulationSection.hidden = true;
    dom.progressBox.hidden = false;
    dom.progressFill.style.width = '0%';
    dom.progressText.textContent = t('progress.init');
    dom.btnGenerate.hidden = true;
    dom.btnEstimate.hidden = true;
    dom.btnCancel.hidden = false;

    worker.postMessage({
        type: 'generate',
        mainPool: S.mainPool,
        mainPick: S.mainPick,
        mainGuarantee: S.mainGuarantee,
        bonusPool: S.bonusEnabled ? S.bonusPool : 0,
        bonusPick: S.bonusEnabled ? S.bonusPick : 0,
        bonusGuarantee: S.bonusEnabled ? S.bonusGuarantee : 0
    });
}

function updateProgress(percent, ticketCount, uncovered) {
    const pct = Math.round(percent * 100);
    dom.progressFill.style.width = pct + '%';
    dom.progressText.textContent = t('progress.status', {
        pct,
        ticketCount: formatNumber(ticketCount),
        uncovered: formatNumber(uncovered)
    });
}

function onComplete(d) {
    dom.progressBox.hidden = true;
    dom.btnGenerate.hidden = false;
    dom.btnEstimate.hidden = false;
    dom.btnCancel.hidden = true;

    S.tickets = d.tickets;
    S.bonusNumbers = d.bonusNumbers;
    S.page = 0;

    dom.ticketsSection.hidden = false;
    dom.simulationSection.hidden = false;
    dom.sanityBadge.hidden = true;
    dom.sanityFailBadge.hidden = true;
    dom.sanityCheckInfo.hidden = true;
    dom.sanityProgressBox.hidden = true;
    dom.btnSanityCheck.disabled = false;
    updateTicketHeader();
    renderTickets();
    generateDefaultTiers();
}

function updateTicketHeader() {
    const count = S.tickets.length;
    dom.ticketCount.textContent = formatNumber(count);
    dom.ticketCountLabel.textContent = t('tickets.count', { n: '' }).trim();
    dom.totalCostLabel.textContent = t('tickets.totalCost');
    dom.totalCost.textContent = formatMoney(count * S.ticketCost);
}

function cancelGeneration() {
    initWorker();
    dom.progressBox.hidden = true;
    dom.btnGenerate.hidden = false;
    dom.btnEstimate.hidden = false;
    dom.btnCancel.hidden = true;
}

function showError(msg) {
    dom.errorBox.textContent = msg;
    dom.errorBox.hidden = false;
    dom.progressBox.hidden = true;
    dom.btnGenerate.hidden = false;
    dom.btnEstimate.hidden = false;
    dom.btnCancel.hidden = true;
}

// ===== Ticket Display =====
function renderTickets() {
    const total = S.tickets.length;
    if (total === 0) return;

    const pages = Math.ceil(total / S.pageSize);
    S.page = clamp(S.page, 0, pages - 1);

    const start = S.page * S.pageSize;
    const end = Math.min(start + S.pageSize, total);
    const hasBonus = S.bonusEnabled && S.bonusNumbers.length > 0;

    let html = '';
    for (let i = start; i < end; i++) {
        const ticket = S.tickets[i];
        html += `<div class="ticket-row"><span class="ticket-num">#${i + 1}</span>`;
        for (const n of ticket) html += `<span class="ball">${pad(n)}</span>`;
        if (hasBonus) {
            html += `<span class="separator"></span>`;
            html += `<span class="ball bonus">${pad(S.bonusNumbers[i])}</span>`;
        }
        html += '</div>';
    }
    dom.ticketsDisplay.innerHTML = html;

    dom.btnPrev.onclick = () => { S.page--; renderTickets(); };
    dom.btnNext.onclick = () => { S.page++; renderTickets(); };
    updatePaginationUI();
}

// ===== Sanity Check =====
function requestSanityCheck() {
    if (S.tickets.length === 0) return;

    // Reset UI
    dom.sanityBadge.hidden = true;
    dom.sanityFailBadge.hidden = true;
    dom.sanityCheckInfo.hidden = false;
    dom.sanityProgressBox.hidden = false;
    dom.sanityProgressFill.style.width = '0%';
    dom.sanityProgressText.textContent = t('sanity.starting');
    dom.btnSanityCheck.disabled = true;

    // Send tickets to worker (convert to 0-indexed)
    worker.postMessage({
        type: 'sanityCheck',
        tickets: S.tickets.map(ticket => ticket.map(x => x - 1)),
        mainPool: S.mainPool,
        mainPick: S.mainPick,
        mainGuarantee: S.mainGuarantee
    });
}

function updateSanityProgress(d) {
    const pct = Math.round(d.percent * 100);
    dom.sanityProgressFill.style.width = pct + '%';
    dom.sanityProgressText.textContent = t('sanity.progress', {
        pct,
        checked: formatNumber(d.checked),
        total: formatNumber(d.total)
    });
}

function showSanityResult(d) {
    dom.sanityProgressBox.hidden = true;
    dom.btnSanityCheck.disabled = false;

    if (d.passed) {
        dom.sanityBadge.hidden = false;
        dom.sanityFailBadge.hidden = true;
        dom.sanityBadgeTitle.textContent = t('sanity.passTitle');
        dom.sanityBadgeDetail.textContent = t('sanity.passDetail', {
            total: formatNumber(d.totalCombinations),
            t: S.mainGuarantee,
            n: S.mainPool
        });
    } else {
        dom.sanityFailBadge.hidden = false;
        dom.sanityBadge.hidden = true;
        dom.sanityFailTitle.textContent = t('sanity.failTitle');
        dom.sanityFailDetail.textContent = t('sanity.failDetail', {
            missing: formatNumber(d.missingCount)
        });
    }
}

// ===== CSV Download =====
function downloadCSV() {
    const hasBonus = S.bonusEnabled && S.bonusNumbers.length > 0;
    const headers = [];
    for (let i = 1; i <= S.mainPick; i++) headers.push(`Main${i}`);
    if (hasBonus) for (let i = 1; i <= S.bonusPick; i++) headers.push(`Bonus${i}`);

    const lines = [headers.join(',')];
    for (let i = 0; i < S.tickets.length; i++) {
        const row = [...S.tickets[i]];
        if (hasBonus) row.push(S.bonusNumbers[i]);
        lines.push(row.join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lottery_tickets_${S.mainPick}_${S.mainPool}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ===== Prize Tiers =====
function generateDefaultTiers() {
    dom.prizeTiers.innerHTML = '';
    S.prizeTiers = [];

    const minMatch = Math.max(2, S.mainGuarantee);
    const defaults = defaultPrizes(S.mainPick, S.bonusEnabled);

    for (let m = S.mainPick; m >= minMatch; m--) {
        if (S.bonusEnabled) addTierRow(m, true, defaults[`${m}+1`] || 0);
        addTierRow(m, false, defaults[`${m}+0`] || 0);
    }
}

function defaultPrizes(k, hasBonus) {
    const map = {};
    const base = [10000000, 1000000, 50000, 1500, 500, 50, 20, 10, 5, 2];
    let idx = 0;
    for (let m = k; m >= 1; m--) {
        if (hasBonus) { map[`${m}+1`] = base[idx] || 1; idx++; }
        map[`${m}+0`] = base[idx] || 1;
        idx++;
    }
    return map;
}

function addTierRow(mainMatch, bonusMatch, prize) {
    const row = document.createElement('div');
    row.className = 'tier-row';
    row.innerHTML = `
        <label>${t('tier.match')}</label>
        <input type="number" class="tier-main" value="${mainMatch}" min="0" max="${S.mainPick}">
        <label>${t('tier.of', { n: S.mainPick })}</label>
        ${S.bonusEnabled ? `
            <span class="checkbox-inline">
                <input type="checkbox" class="tier-bonus" ${bonusMatch ? 'checked' : ''}>
                <label>${t('tier.bonus')}</label>
            </span>
        ` : ''}
        <label>${t('tier.prize')}</label>
        <input type="number" class="tier-prize wide" value="${prize}" min="0" step="0.01">
        <button class="remove-tier" title="Remove">&times;</button>
    `;
    row.querySelector('.remove-tier').addEventListener('click', () => row.remove());
    dom.prizeTiers.appendChild(row);
}

function readTiers() {
    const rows = dom.prizeTiers.querySelectorAll('.tier-row');
    const tiers = [];
    rows.forEach(row => {
        const main = +(row.querySelector('.tier-main')?.value || 0);
        const bonusEl = row.querySelector('.tier-bonus');
        const bonus = bonusEl ? bonusEl.checked : false;
        const prize = +(row.querySelector('.tier-prize')?.value || 0);
        if (prize > 0) tiers.push({ mainMatch: main, bonusMatch: bonus, prize });
    });
    tiers.sort((a, b) => b.prize - a.prize);
    return tiers;
}

// ===== Simulation =====
function runSimulation() {
    dom.simResults.hidden = true;

    const winMain = parseNumbers(dom.winningMain.value);
    if (winMain.length !== S.mainPick) {
        alert(t('alert.enterMainNumbers', { n: S.mainPick }));
        return;
    }
    for (const n of winMain) {
        if (n < 1 || n > S.mainPool) {
            alert(t('alert.mainNumberRange', { n: S.mainPool }));
            return;
        }
    }
    if (new Set(winMain).size !== winMain.length) {
        alert(t('alert.mainNumbersUnique'));
        return;
    }

    let winBonus = [];
    if (S.bonusEnabled) {
        winBonus = parseNumbers(dom.winningBonus.value);
        if (winBonus.length !== S.bonusPick) {
            alert(t('alert.enterBonusNumbers', { n: S.bonusPick }));
            return;
        }
        for (const n of winBonus) {
            if (n < 1 || n > S.bonusPool) {
                alert(t('alert.bonusNumberRange', { n: S.bonusPool }));
                return;
            }
        }
    }

    const tiers = readTiers();
    if (tiers.length === 0) {
        alert(t('alert.definePrizeTier'));
        return;
    }

    const winMainSet = new Set(winMain);
    const winBonusSet = new Set(winBonus);
    const hasBonus = S.bonusEnabled && S.bonusNumbers.length > 0;

    const tierCounts = new Array(tiers.length).fill(0);
    let totalWinnings = 0;
    let bestGuaranteeMain = 0;

    for (let i = 0; i < S.tickets.length; i++) {
        const ticket = S.tickets[i];
        let mainHits = 0;
        for (const n of ticket) { if (winMainSet.has(n)) mainHits++; }

        let bonusHit = false;
        if (hasBonus && winBonusSet.has(S.bonusNumbers[i])) bonusHit = true;

        bestGuaranteeMain = Math.max(bestGuaranteeMain, mainHits);

        let won = 0;
        for (let ti = 0; ti < tiers.length; ti++) {
            const tier = tiers[ti];
            if (mainHits >= tier.mainMatch && (!tier.bonusMatch || bonusHit)) {
                tierCounts[ti]++;
                won = tier.prize;
                break;
            }
        }
        totalWinnings += won;
    }

    const totalCost = S.tickets.length * S.ticketCost;
    const net = totalWinnings - totalCost;
    const roi = totalCost > 0 ? (net / totalCost * 100) : 0;

    // Probabilities
    const tierProbs = computeTierProbabilities(tiers);
    const numTickets = S.tickets.length;
    let expectedWinnings = 0;
    const expectedCounts = tierProbs.map((p, i) => {
        const ew = p * numTickets;
        expectedWinnings += ew * tiers[i].prize;
        return ew;
    });
    const expectedNet = expectedWinnings - totalCost;
    const expectedRoi = totalCost > 0 ? (expectedNet / totalCost * 100) : 0;
    const pAnyWin = tierProbs.reduce((a, b) => a + b, 0);
    const evPerTicket = tiers.reduce((s, tier, i) => s + tierProbs[i] * tier.prize, 0);

    // Render
    let html = `
        <div class="result-summary">
            <div class="result-card">
                <div class="label">${t('result.totalCost')}</div>
                <div class="value">${formatMoney(totalCost)}</div>
            </div>
            <div class="result-card">
                <div class="label">${t('result.actualWinnings')}</div>
                <div class="value ${totalWinnings > 0 ? 'positive' : ''}">${formatMoney(totalWinnings)}</div>
            </div>
            <div class="result-card">
                <div class="label">${t('result.actualNet')}</div>
                <div class="value ${net >= 0 ? 'positive' : 'negative'}">${formatMoney(net)}</div>
            </div>
            <div class="result-card">
                <div class="label">${t('result.actualRoi')}</div>
                <div class="value ${roi >= 0 ? 'positive' : 'negative'}">${roi.toFixed(1)}%</div>
            </div>
        </div>
        <div class="result-summary">
            <div class="result-card">
                <div class="label">${t('result.expectedWinnings')}</div>
                <div class="value">${formatMoney(expectedWinnings)}</div>
            </div>
            <div class="result-card">
                <div class="label">${t('result.expectedNet')}</div>
                <div class="value ${expectedNet >= 0 ? 'positive' : 'negative'}">${formatMoney(expectedNet)}</div>
            </div>
            <div class="result-card">
                <div class="label">${t('result.expectedRoi')}</div>
                <div class="value ${expectedRoi >= 0 ? 'positive' : 'negative'}">${expectedRoi.toFixed(1)}%</div>
            </div>
            <div class="result-card">
                <div class="label">${t('result.evPerTicket')}</div>
                <div class="value ${evPerTicket >= S.ticketCost ? 'positive' : 'negative'}">${formatMoney(evPerTicket)}</div>
            </div>
        </div>
        <div class="result-summary">
            <div class="result-card">
                <div class="label">${t('result.bestMatch')}</div>
                <div class="value">${t('result.bestMatchValue', { hits: bestGuaranteeMain, total: S.mainPick })}</div>
            </div>
            <div class="result-card">
                <div class="label">${t('result.anyPrize')}</div>
                <div class="value">${formatOdds(pAnyWin)}</div>
            </div>
        </div>
        <div class="table-scroll">
        <table class="breakdown-table">
            <thead><tr>
                <th>${t('table.tier')}</th>
                <th>${t('table.odds')}</th>
                <th>${t('table.expectedWins')}</th>
                <th>${t('table.actualWins')}</th>
                <th>${t('table.prizeEach')}</th>
                <th>${t('table.expectedSub')}</th>
                <th>${t('table.actualSub')}</th>
            </tr></thead>
            <tbody>
    `;

    for (let ti = 0; ti < tiers.length; ti++) {
        const tier = tiers[ti];
        const label = `${tier.mainMatch}/${S.mainPick}${tier.bonusMatch ? ' + Bonus' : ''}`;
        const actualSub = tierCounts[ti] * tier.prize;
        const ew = expectedCounts[ti];
        const expSub = ew * tier.prize;
        const hl = tierCounts[ti] > 0 ? ' class="highlight"' : '';
        html += `<tr${hl}>
            <td>${label}</td>
            <td>${formatOdds(tierProbs[ti])}</td>
            <td>${ew < 0.01 && ew > 0 ? ew.toExponential(1) : ew.toFixed(1)}</td>
            <td>${formatNumber(tierCounts[ti])}</td>
            <td>${formatMoney(tier.prize)}</td>
            <td>${formatMoney(expSub)}</td>
            <td>${formatMoney(actualSub)}</td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    html += `<h3 style="margin-top:20px">${t('drawnNumbers')}</h3><div style="display:flex;align-items:center;gap:6px;margin:8px 0;flex-wrap:wrap">`;
    for (const n of winMain) html += `<span class="ball match">${pad(n)}</span>`;
    if (hasBonus) {
        html += '<span class="separator"></span>';
        for (const n of winBonus) html += `<span class="ball bonus match">${pad(n)}</span>`;
    }
    html += '</div>';

    dom.resultsContent.innerHTML = html;
    dom.simResults.hidden = false;
    renderTicketsWithMatches(winMainSet, winBonusSet);
}

function renderTicketsWithMatches(winMainSet, winBonusSet) {
    const total = S.tickets.length;
    if (total === 0) return;

    const pages = Math.ceil(total / S.pageSize);
    const start = S.page * S.pageSize;
    const end = Math.min(start + S.pageSize, total);
    const hasBonus = S.bonusEnabled && S.bonusNumbers.length > 0;

    let html = '';
    for (let i = start; i < end; i++) {
        const ticket = S.tickets[i];
        html += `<div class="ticket-row"><span class="ticket-num">#${i + 1}</span>`;
        for (const n of ticket) {
            html += `<span class="ball${winMainSet.has(n) ? ' match' : ''}">${pad(n)}</span>`;
        }
        if (hasBonus) {
            html += `<span class="separator"></span>`;
            html += `<span class="ball bonus${winBonusSet.has(S.bonusNumbers[i]) ? ' match' : ''}">${pad(S.bonusNumbers[i])}</span>`;
        }
        html += '</div>';
    }
    dom.ticketsDisplay.innerHTML = html;

    dom.btnPrev.onclick = () => { S.page--; renderTicketsWithMatches(winMainSet, winBonusSet); updatePaginationUI(); };
    dom.btnNext.onclick = () => { S.page++; renderTicketsWithMatches(winMainSet, winBonusSet); updatePaginationUI(); };
    updatePaginationUI();
}

function updatePaginationUI() {
    const pages = Math.ceil(S.tickets.length / S.pageSize) || 1;
    S.page = clamp(S.page, 0, pages - 1);
    dom.pageInfo.textContent = t('pagination.page', { current: S.page + 1, total: pages });
    dom.btnPrev.disabled = S.page === 0;
    dom.btnNext.disabled = S.page >= pages - 1;
}

// ===== Probability Engine =====
function binomial(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n - k) k = n - k;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
}

function pExactMainMatches(j) {
    const n = S.mainPool, k = S.mainPick;
    return binomial(k, j) * binomial(n - k, k - j) / binomial(n, k);
}

function computeTierProbabilities(tiers) {
    const hasBonus = S.bonusEnabled;
    const pBonus = hasBonus ? 1 / S.bonusPool : 0;
    const mainP = [];
    for (let j = 0; j <= S.mainPick; j++) mainP[j] = pExactMainMatches(j);

    const tierProbs = new Array(tiers.length).fill(0);
    for (let j = 0; j <= S.mainPick; j++) {
        for (let bh = 0; bh <= (hasBonus ? 1 : 0); bh++) {
            const p = hasBonus ? mainP[j] * (bh ? pBonus : 1 - pBonus) : mainP[j];
            for (let ti = 0; ti < tiers.length; ti++) {
                if (j >= tiers[ti].mainMatch && (!tiers[ti].bonusMatch || bh)) {
                    tierProbs[ti] += p;
                    break;
                }
            }
        }
    }
    return tierProbs;
}

function formatOdds(p) {
    if (p <= 0) return t('odds.none');
    if (p >= 1) return '100%';
    if (p >= 0.01) return (p * 100).toFixed(2) + '%';
    const inv = Math.round(1 / p);
    return t('odds.oneIn', { n: formatNumber(inv) });
}

// ===== Utilities =====
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function parseNumbers(s) { return s.split(/[,\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x)); }

const LOCALE_CURRENCY = { en: 'USD', pt: 'BRL', es: 'USD', fr: 'EUR', de: 'EUR', zh: 'CNY' };

function formatMoney(n) {
    return new Intl.NumberFormat(currentLocale, {
        style: 'currency',
        currency: LOCALE_CURRENCY[currentLocale] || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(n);
}
