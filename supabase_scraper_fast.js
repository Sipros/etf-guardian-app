const puppeteer = require('puppeteer');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
require('dotenv').config();

// ── Configurazione ────────────────────────────────────────────────────────────

const CONCURRENCY = 5; // pagine browser parallele

const config = {
    supabase: {
        url: process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL',
        anonKey: process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
    },
    scheduling: {
        // Disabilitato: GitHub Actions gestisce lo scheduling via workflow cron
        enabled: false,
        cronPattern: '*/15 * * * *'
    },
    cleanup: {
        retentionDays: 30
    }
};

// Tutti i campionati via API — nessun Puppeteer per la lista match
const LEAGUES = [
    { name: 'Premier League', id: 1980, path: '/en/soccer/england-premier-league/' },
    { name: 'Serie A',        id: 2436, path: '/en/soccer/italy-serie-a/' },
    { name: 'La Liga',        id: 2196, path: '/en/soccer/spain-la-liga/' },
    { name: 'Bundesliga',     id: 1842, path: '/en/soccer/germany-bundesliga/' },
    { name: 'Ligue 1',        id: 2036, path: '/en/soccer/france-ligue-1/' },
];

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

// ── Page Pool ─────────────────────────────────────────────────────────────────

class PagePool {
    constructor(browser, size) {
        this.available = [];
        this.waiting = [];
        this.browser = browser;
        this.size = size;
    }

    async init() {
        this.available = await Promise.all(
            Array.from({ length: this.size }, async () => {
                const page = await this.browser.newPage();
                await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
                return page;
            })
        );
    }

    async acquire() {
        if (this.available.length > 0) return this.available.pop();
        return new Promise(resolve => this.waiting.push(resolve));
    }

    release(page) {
        if (this.waiting.length > 0) {
            this.waiting.shift()(page);
        } else {
            this.available.push(page);
        }
    }
}

// ── Fetch match via API ───────────────────────────────────────────────────────

function fetchLeagueMatches(league) {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/leagues/${league.id}/matchups?brandId=0`;
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const matches = json
                        .filter(m =>
                            m.type === 'matchup' &&
                            m.participants?.length > 0 &&
                            !m.participants[0].name.includes('Home Teams') &&
                            !m.participants.some(p => p.name.includes('(Corners)') || p.name.includes('(Bookings)'))
                        )
                        .map(m => {
                            const home = m.participants.find(p => p.alignment === 'home');
                            const away = m.participants.find(p => p.alignment === 'away');
                            if (!home || !away) return null;
                            const slug = `${home.name.toLowerCase().replace(/\s+/g, '-')}-vs-${away.name.toLowerCase().replace(/\s+/g, '-')}`;
                            return {
                                matchId: m.id,
                                teams: `${home.name} vs ${away.name}`,
                                matchDatetime: new Date(m.startTime).toISOString(),
                                url: `https://www.pinnacle.com${league.path}${slug}/${m.id}/`
                            };
                        })
                        .filter(Boolean);
                    matches.sort((a, b) => a.matchDatetime.localeCompare(b.matchDatetime));
                    resolve(matches);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// ── Estrazione quote ──────────────────────────────────────────────────────────

async function extractOdds(page, match) {
    try {
        await page.goto(match.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Aspetta elemento principale invece di sleep fisso
        await page.waitForSelector('.titleText-BgvECQYfHf', { timeout: 10000 });

        // Show All
        await page.evaluate(() => {
            for (const s of ['button[class*="showAll"]', 'div[class*="showAll"]', '[class*="showAllButton"]']) {
                const el = document.querySelector(s);
                if (el) { el.click(); return; }
            }
        });
        await new Promise(r => setTimeout(r, 500));

        // Clicca tutti i "See more" in un singolo passaggio (uno per ogni sezione)
        await page.evaluate(() => {
            for (const btn of document.querySelectorAll('button')) {
                if (btn.textContent.toLowerCase().includes('see more')) btn.click();
            }
        });
        await new Promise(r => setTimeout(r, 800));

        const data = await page.evaluate(() => {
            const result = { quote1x2: [], totalMatch: [], bothTeamsToScore: [], correctScore: [] };

            // 1X2
            document.querySelectorAll('[data-test-id="moneyline"] .price-r5BU0ynJha, .moneyline .price-r5BU0ynJha, [class*="moneyline"] .price-r5BU0ynJha')
                .forEach(el => {
                    const p = el.textContent.trim();
                    if (p && result.quote1x2.length < 3) result.quote1x2.push(p);
                });

            // BTTS, Over/Under, Correct Score
            document.querySelectorAll('.titleText-BgvECQYfHf').forEach(titleEl => {
                const title = titleEl.textContent.trim();
                const container = titleEl.closest('[data-test-id]');
                if (!container) return;

                if (title === 'Both Teams To Score?') {
                    container.querySelectorAll('.buttonWrapper-ofFCIiahBj').forEach((el, i) => {
                        if (i >= 2) return;
                        const label = el.querySelector('.label-GT4CkXEOFj')?.textContent.trim();
                        const price = el.querySelector('.price-r5BU0ynJha')?.textContent.trim();
                        if (label && price && (label === 'Yes' || label === 'No')) {
                            result.bothTeamsToScore.push({ tipo: label, quota: price });
                        }
                    });
                }

                if (title === 'Total – Match') {
                    container.querySelectorAll('.buttonWrapper-ofFCIiahBj').forEach(el => {
                        const label = el.querySelector('.label-GT4CkXEOFj')?.textContent.trim()
                                   || el.querySelector('button')?.getAttribute('title')?.trim();
                        const price = el.querySelector('.price-r5BU0ynJha')?.textContent.trim();
                        if (label && price &&
                            (label.includes('Over') || label.includes('Under')) &&
                            !['&', 'Team', 'Odd', 'Even', 'Corner', 'Booking', 'Card', 'Corners'].some(x => label.includes(x))) {
                            result.totalMatch.push({ tipo: label, quota: price });
                        }
                    });
                }

                if (title.includes('Correct Score')) {
                    container.querySelectorAll('.buttonWrapper-ofFCIiahBj').forEach(el => {
                        const label = el.querySelector('.label-GT4CkXEOFj')?.textContent.trim();
                        const price = el.querySelector('.price-r5BU0ynJha')?.textContent.trim();
                        if (label && price) {
                            const parts = label.split(',');
                            if (parts.length === 2) {
                                const a = parts[0].trim().split(' ').pop();
                                const b = parts[1].trim().split(' ').pop();
                                result.correctScore.push({ tipo: `${a} - ${b}`, quota: price });
                            } else {
                                result.correctScore.push({ tipo: label, quota: price });
                            }
                        }
                    });
                }
            });

            return result;
        });

        return { success: true, data };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ── Build snapshot ────────────────────────────────────────────────────────────

function buildSnapshot(matchId, oddsData) {
    const snap = { match_id: matchId, timestamp: new Date().toISOString() };

    // 1X2
    if (oddsData.quote1x2?.length >= 3) {
        snap.quota_home = parseFloat(oddsData.quote1x2[0]) || null;
        snap.quota_draw = parseFloat(oddsData.quote1x2[1]) || null;
        snap.quota_away = parseFloat(oddsData.quote1x2[2]) || null;
    }

    // BTTS
    const bttsYes = oddsData.bothTeamsToScore?.find(x => x.tipo === 'Yes');
    const bttsNo  = oddsData.bothTeamsToScore?.find(x => x.tipo === 'No');
    if (bttsYes) snap.btts_yes = parseFloat(bttsYes.quota);
    if (bttsNo)  snap.btts_no  = parseFloat(bttsNo.quota);

    // Over/Under
    const validLines = [1.5, 2.5, 3.5, 4.5];
    for (const line of validLines) {
        snap[`over_${line.toString().replace('.', '_')}`]  = null;
        snap[`under_${line.toString().replace('.', '_')}`] = null;
    }
    for (const item of (oddsData.totalMatch || [])) {
        const m = item.tipo.match(/(Over|Under)\s+(\d+\.5)/);
        if (!m) continue;
        const lineVal = parseFloat(m[2]);
        if (!validLines.includes(lineVal)) continue;
        snap[`${m[1].toLowerCase()}_${m[2].replace('.', '_')}`] = parseFloat(item.quota);
    }

    // Correct Score
    for (let h = 0; h <= 4; h++) for (let a = 0; a <= 4; a++) snap[`cs_${h}_${a}`] = null;
    for (const score of (oddsData.correctScore || [])) {
        const m = score.tipo.match(/^(\d+)\s*-\s*(\d+)$/);
        if (!m) continue;
        const [, h, a] = m.map(Number);
        if (h > 4 || a > 4) continue;
        snap[`cs_${h}_${a}`] = parseFloat(score.quota);
    }

    return snap;
}

// ── Scraping principale ───────────────────────────────────────────────────────

async function runScraping() {
    console.log(`\n🚀 INIZIO SCRAPING — ${new Date().toISOString()}`);
    const start = Date.now();

    // Fase 1: fetch tutti i match via API in parallelo
    console.log('\n📡 Fase 1: fetch match da API (tutti i campionati in parallelo)...');
    const leagueResults = await Promise.allSettled(LEAGUES.map(fetchLeagueMatches));

    const allMatches = [];
    leagueResults.forEach((res, i) => {
        if (res.status === 'fulfilled') {
            console.log(`  ✅ ${LEAGUES[i].name}: ${res.value.length} match`);
            allMatches.push(...res.value);
        } else {
            console.log(`  ❌ ${LEAGUES[i].name}: ${res.reason.message}`);
        }
    });
    console.log(`📊 Totale match: ${allMatches.length}`);

    if (allMatches.length === 0) {
        console.log('⚠️ Nessun match trovato, uscita.');
        return;
    }

    // Fase 2: estrazione quote con page pool
    console.log(`\n🏃 Fase 2: estrazione quote (${CONCURRENCY} pagine parallele)...`);
    const puppeteerOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const browser = await puppeteer.launch(puppeteerOptions);
    const pool = new PagePool(browser, CONCURRENCY);
    await pool.init();

    const oddsResults = await Promise.all(allMatches.map(async (match, i) => {
        const page = await pool.acquire();
        try {
            process.stdout.write(`  [${i + 1}/${allMatches.length}] ${match.teams}... `);
            const result = await extractOdds(page, match);
            console.log(result.success ? '✅' : `❌ ${result.error}`);
            return { match, ...result };
        } catch (err) {
            console.log(`❌ ${err.message}`);
            return { match, success: false, error: err.message };
        } finally {
            pool.release(page);
        }
    }));

    await browser.close();

    // Fase 3: batch insert Supabase
    console.log('\n💾 Fase 3: salvataggio batch su Supabase...');
    const successful = oddsResults.filter(r => r.success);

    if (successful.length > 0) {
        // Upsert matches (batch unico)
        const matchRows = successful.map(r => ({
            match_id: r.match.matchId,
            match_name: r.match.teams,
            match_datetime: r.match.matchDatetime,
            url: r.match.url
        }));
        const { error: matchErr } = await supabase
            .from('matches')
            .upsert(matchRows, { onConflict: 'match_id' });
        if (matchErr) console.error('❌ Errore upsert matches:', matchErr.message);
        else console.log(`  ✅ ${matchRows.length} matches upserted`);

        // Insert snapshots (batch unico)
        const snapshots = successful.map(r => buildSnapshot(r.match.matchId, r.data));
        const { error: snapErr } = await supabase
            .from('odds_snapshots')
            .insert(snapshots);
        if (snapErr) console.error('❌ Errore insert snapshots:', snapErr.message);
        else console.log(`  ✅ ${snapshots.length} snapshots inseriti`);
    }

    // Cleanup
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - config.cleanup.retentionDays);
        await supabase.from('odds_snapshots').delete().lt('timestamp', cutoff.toISOString());
        console.log('🧹 Cleanup completato');
    } catch (e) {
        console.error('❌ Errore cleanup:', e.message);
    }

    const mins = ((Date.now() - start) / 60000).toFixed(1);
    const failed = oddsResults.length - successful.length;
    console.log(`\n✅ Completato in ${mins} minuti`);
    console.log(`📊 ${successful.length} OK / ${failed} falliti / ${allMatches.length} totali`);

    return { successful: successful.length, failed, total: allMatches.length, mins };
}

// ── Avvio ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 Supabase Football Odds Scraper — Fast Edition');

    if (config.supabase.url === 'YOUR_SUPABASE_URL' || config.supabase.anonKey === 'YOUR_SUPABASE_ANON_KEY') {
        console.error('❌ Imposta SUPABASE_URL e SUPABASE_ANON_KEY nel .env');
        process.exit(1);
    }

    try {
        const { data, error } = await supabase.from('matches').select('count').limit(1);
        if (error) throw error;
        console.log('✅ Connessione Supabase OK');
    } catch (err) {
        console.error('❌ Errore connessione Supabase:', err.message);
        process.exit(1);
    }

    if (config.scheduling.enabled) {
        console.log(`⏰ Scheduling: ${config.scheduling.cronPattern}`);
        cron.schedule(config.scheduling.cronPattern, async () => {
            try { await runScraping(); } catch (e) { console.error('❌ Errore schedulato:', e.message); }
        });
    }

    await runScraping();
}

process.on('SIGINT', () => { console.log('\n👋 Arresto.'); process.exit(0); });

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { runScraping };
