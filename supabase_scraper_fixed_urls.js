const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
require('dotenv').config();

// CONFIGURAZIONE
const config = {
    supabase: {
        url: process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL',
        anonKey: process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
    },
    scheduling: {
        enabled: true,
        cronPattern: '*/15 * * * *' // Ogni 15 minuti
    },
    cleanup: {
        threshold: 0.8, // 80% capacità
        retentionDays: 30
    },
    retry: {
        maxAttempts: 3,
        baseDelay: 2000 // 2 secondi
    }
};

// CAMPIONATI DA PROCESSARE con PATH CORRETTI
const LEAGUES_TO_PROCESS = [
    {
        name: 'Premier League',
        url: 'https://www.pinnacle.com/en/soccer/england-premier-league/matchups/#all',
        extractionMethod: 'dynamic',
        path: '/en/soccer/england-premier-league/'
    },
    {
        name: 'Serie A',
        url: 'https://guest.api.arcadia.pinnacle.com/0.1/leagues/2436/matchups?brandId=0',
        extractionMethod: 'api',
        path: '/en/soccer/italy-serie-a/'
    },
    {
        name: 'La Liga',
        url: 'https://guest.api.arcadia.pinnacle.com/0.1/leagues/2196/matchups?brandId=0',
        extractionMethod: 'api',
        path: '/en/soccer/spain-la-liga/'
    },
    {
        name: 'Bundesliga',
        url: 'https://guest.api.arcadia.pinnacle.com/0.1/leagues/1842/matchups?brandId=0',
        extractionMethod: 'api',
        path: '/en/soccer/germany-bundesliga/'
    },
    {
        name: 'Ligue 1',
        url: 'https://guest.api.arcadia.pinnacle.com/0.1/leagues/2036/matchups?brandId=0',
        extractionMethod: 'api',
        path: '/en/soccer/france-ligue-1/'
    }
];

// Inizializza Supabase client
const supabase = createClient(config.supabase.url, config.supabase.anonKey);

// Funzione per retry con exponential backoff
async function retryWithBackoff(operation, maxAttempts = config.retry.maxAttempts, baseDelay = config.retry.baseDelay) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === maxAttempts) {
                throw error;
            }
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`⚠️ Tentativo ${attempt}/${maxAttempts} fallito, retry tra ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

// Verifica se un match esiste nel database
async function ensureMatchExists(matchData) {
    const { matchId, teams, matchDatetime, url } = matchData;
    
    try {
        const { data, error } = await supabase
            .from('matches')
            .upsert({
                match_id: matchId,
                match_name: teams,
                match_datetime: matchDatetime,
                url: url
            }, {
                onConflict: 'match_id'
            })
            .select();

        if (error) throw error;
        return data[0];
    } catch (error) {
        console.error(`❌ Errore inserimento match ${teams}:`, error.message);
        throw error;
    }
}

// Mappa score in colonna corrispondente (accetta "0-0" o "0 - 0")
function getScoreColumn(score) {
    // Rimuovi spazi extra dal formato "0 - 0" → "0-0"
    const cleanScore = score.replace(/\s*-\s*/, '-');
    
    const scoreMap = {
        '0-0': 'cs_0_0', '0-1': 'cs_0_1', '0-2': 'cs_0_2', '0-3': 'cs_0_3', '0-4': 'cs_0_4',
        '1-0': 'cs_1_0', '1-1': 'cs_1_1', '1-2': 'cs_1_2', '1-3': 'cs_1_3', '1-4': 'cs_1_4',
        '2-0': 'cs_2_0', '2-1': 'cs_2_1', '2-2': 'cs_2_2', '2-3': 'cs_2_3', '2-4': 'cs_2_4',
        '3-0': 'cs_3_0', '3-1': 'cs_3_1', '3-2': 'cs_3_2', '3-3': 'cs_3_3', '3-4': 'cs_3_4',
        '4-0': 'cs_4_0', '4-1': 'cs_4_1', '4-2': 'cs_4_2', '4-3': 'cs_4_3', '4-4': 'cs_4_4'
    };
    return scoreMap[cleanScore] || null;
}

// Mappa Over/Under in colonne corrispondenti
function getOverUnderColumns(line, type) {
    const columnMap = {
        '1.5': {
            'Over': 'over_1_5',
            'Under': 'under_1_5'
        },
        '2.5': {
            'Over': 'over_2_5',
            'Under': 'under_2_5'
        },
        '3.5': {
            'Over': 'over_3_5',
            'Under': 'under_3_5'
        },
        '4.5': {
            'Over': 'over_4_5',
            'Under': 'under_4_5'
        }
    };
    return columnMap[line]?.[type] || null;
}

// Inserisci UNA SOLA RIGA con tutte le quote per match
async function insertCompleteOddsSnapshot(matchId, oddsData) {
    const timestamp = new Date().toISOString();
    
    // Crea UN SOLO RECORD con tutte le quote
    const completeSnapshot = {
        match_id: matchId,
        timestamp: timestamp
    };

    // 1X2 market
    if (oddsData.quote1x2) {
        completeSnapshot.quota_home = oddsData.quote1x2?.casa === "N/A" ? null : parseFloat(oddsData.quote1x2?.casa);
        completeSnapshot.quota_draw = oddsData.quote1x2?.pareggio === "N/A" ? null : parseFloat(oddsData.quote1x2?.pareggio);
        completeSnapshot.quota_away = oddsData.quote1x2?.trasferta === "N/A" ? null : parseFloat(oddsData.quote1x2?.trasferta);
    }

    // BTTS market
    if (oddsData.bothTeamsToScore && Array.isArray(oddsData.bothTeamsToScore)) {
        const bttsYes = oddsData.bothTeamsToScore.find(item => item.tipo === 'Yes');
        const bttsNo = oddsData.bothTeamsToScore.find(item => item.tipo === 'No');
        
        completeSnapshot.btts_yes = bttsYes ? parseFloat(bttsYes.quota) : null;
        completeSnapshot.btts_no = bttsNo ? parseFloat(bttsNo.quota) : null;
    }

    // Over/Under markets (tutte le linee nella stessa riga)
    if (oddsData.totalMatch && Array.isArray(oddsData.totalMatch)) {
        const validLines = [1.5, 2.5, 3.5, 4.5];
        
        // Inizializza tutte le colonne Over/Under a null
        for (const line of validLines) {
            const overColumn = `over_${line.toString().replace('.', '_')}`;
            const underColumn = `under_${line.toString().replace('.', '_')}`;
            completeSnapshot[overColumn] = null;
            completeSnapshot[underColumn] = null;
        }

        // Popola le colonne con i dati estratti
        for (const total of oddsData.totalMatch) {
            const lineMatch = total.tipo.match(/(Over|Under)\s+(\d+\.5)/);
            if (!lineMatch) continue;

            const [, type, line] = lineMatch;
            const lineValue = parseFloat(line);

            if (!validLines.includes(lineValue)) continue;

            const overColumn = `over_${lineValue.toString().replace('.', '_')}`;
            const underColumn = `under_${lineValue.toString().replace('.', '_')}`;
            
            if (type === 'Over') {
                completeSnapshot[overColumn] = parseFloat(total.quota);
            } else {
                completeSnapshot[underColumn] = parseFloat(total.quota);
            }
        }
    }

    // Correct Score markets (tutti i risultati nella stessa riga)
    if (oddsData.correctScore && Array.isArray(oddsData.correctScore)) {
        // Inizializza tutte le colonne correct score a null
        for (let home = 0; home <= 4; home++) {
            for (let away = 0; away <= 4; away++) {
                const columnName = `cs_${home}_${away}`;
                completeSnapshot[columnName] = null;
            }
        }

        // Popola le colonne con i dati estratti
        for (const score of oddsData.correctScore) {
            const scoreText = score.tipo;
            
            // Verifica formato score (accetta "0-0" o "0 - 0")
            const scoreMatch = scoreText.match(/^(\d+)\s*-\s*(\d+)$/);
            if (!scoreMatch) continue;

            const [, home, away] = scoreMatch.map(Number);
            
            // Filtra solo score con entrambe le squadre <= 4
            if (home > 4 || away > 4) continue;

            const columnName = getScoreColumn(scoreText);
            if (columnName) {
                completeSnapshot[columnName] = parseFloat(score.quota);
            }
        }
    }

    try {
        const { data, error } = await supabase
            .from('odds_snapshots')
            .insert(completeSnapshot)
            .select();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`❌ Errore inserimento snapshot match ${matchId}:`, error.message);
        throw error;
    }
}

// Inserisci match completo con retry
async function insertMatchWithRetry(matchData) {
    try {
        await retryWithBackoff(async () => {
            await ensureMatchExists(matchData);
        });

        await retryWithBackoff(async () => {
            await insertCompleteOddsSnapshot(matchData.matchId, matchData);
        });

        return { success: true };
    } catch (error) {
        console.error(`❌ Errore completo inserimento match ${matchData.teams}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Funzione per estrarre match dinamicamente (CON DATE REALI)
async function extractDynamicMatches(league) {
    // Configurazione Puppeteer per GitHub Actions
    const puppeteerOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    
    // Su GitHub Actions, specifica il path di Chrome
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    const browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();
    
    console.log(`🔍 Estrazione dinamica ${league.name}...`);
    await page.goto(league.url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Estrai match base dalla pagina matchups
    const matches = await page.evaluate(() => {
        const matchElements = document.querySelectorAll('.row-u9F3b9WCM3.row-k9ktBvvTsJ');
        const matches = [];
        
        matchElements.forEach((element, index) => {
            try {
                const linkElement = element.querySelector('a[href*="/en/soccer/"]');
                if (!linkElement) return;
                
                const href = linkElement.getAttribute('href');
                if (!href || href.includes('home-teams') || href.includes('away-teams')) return;
                
                const teamLabels = element.querySelectorAll('.gameInfoLabel-EDDYv5xEfd span');
                if (teamLabels.length < 2) return;
                
                const team1 = teamLabels[0].textContent.trim().replace(' (Match)', '');
                const team2 = teamLabels[1].textContent.trim().replace(' (Match)', '');
                
                // Filtra match speciali (Corners, Bookings, etc.)
                if (team1.includes('(') || team2.includes('(') || 
                    team1.includes('Corners') || team2.includes('Corners') ||
                    team1.includes('Bookings') || team2.includes('Bookings')) {
                    return; // Salta match speciali
                }
                
                const timeElement = element.querySelector('.matchupDate-tnomIYorwa');
                const time = timeElement ? timeElement.textContent.trim() : '';
                
                const matchIdMatch = href.match(/(\d+)\/$/);
                const matchId = matchIdMatch ? matchIdMatch[1] : '';
                
                const priceElements = element.querySelectorAll('.price-r5BU0ynJha');
                const hasOdds = Array.from(priceElements).some(price => 
                    price.textContent.trim() && !isNaN(parseFloat(price.textContent.trim()))
                );
                
                if (team1 && team2 && matchId && hasOdds) {
                    matches.push({
                        teams: `${team1} vs ${team2}`,
                        matchId: matchId,
                        time: time,
                        url: href.startsWith('http') ? href : `https://www.pinnacle.com${href}`
                    });
                }
            } catch (error) {
                console.log(`Errore nell'elaborare l'elemento ${index}:`, error.message);
            }
        });
        
        return matches;
    });
    
    console.log(`✅ Trovati ${matches.length} partite ${league.name}`);
    
    // Estrai date reali dalle pagine dettaglio
    const matchesWithRealDates = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        console.log(`📅 Estrazione data ${i + 1}/${matches.length}: ${match.teams}`);
        
        try {
            // Vai alla pagina dettaglio per la data
            await page.goto(match.url, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Estrai data con il selettore corretto
            const dateResult = await page.evaluate(() => {
                const startTimeElement = document.querySelector('.startTime-MwYUIH68lR span');
                if (!startTimeElement) return null;
                
                const datetimeText = startTimeElement.textContent.trim();
                
                // Pattern: "Friday, March 20, 2026 at 21:00"
                const datetimePattern = /^(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d{1,2}):(\d{2})$/;
                const match = datetimeText.match(datetimePattern);
                
                if (match) {
                    const [, weekday, month, day, year, hours, minutes] = match;
                    
                    // Mappa mesi
                    const monthMap = {
                        'January': 0, 'February': 1, 'March': 2, 'April': 3,
                        'May': 4, 'June': 5, 'July': 6, 'August': 7,
                        'September': 8, 'October': 9, 'November': 10, 'December': 11
                    };
                    
                    const monthNum = monthMap[month];
                    if (monthNum !== undefined) {
                        const date = new Date(year, monthNum, parseInt(day), parseInt(hours), parseInt(minutes), 0, 0);
                        return date.toISOString();
                    }
                }
                
                return null;
            });
            
            if (dateResult) {
                const matchDate = new Date(dateResult);
                console.log(`   ✅ Data reale: ${matchDate.toLocaleDateString('it-IT')} ${matchDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`);
                
                matchesWithRealDates.push({
                    ...match,
                    matchDatetime: dateResult
                });
            } else {
                // Fallback a vecchio metodo se non trova la data
                console.log(`   ⚠️ Data non trovata, uso fallback`);
                const today = new Date();
                const [hours, minutes] = match.time.split(':');
                today.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                
                matchesWithRealDates.push({
                    ...match,
                    matchDatetime: today.toISOString()
                });
            }
            
        } catch (error) {
            console.log(`   ❌ Errore estrazione data: ${error.message}`);
            // Fallback
            const today = new Date();
            const [hours, minutes] = match.time.split(':');
            today.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            matchesWithRealDates.push({
                ...match,
                matchDatetime: today.toISOString()
            });
        }
        
        // Pausa tra le richieste
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Ordina per data
    matchesWithRealDates.sort((a, b) => a.matchDatetime.localeCompare(b.matchDatetime));
    
    // Mostra range date
    if (matchesWithRealDates.length > 0) {
        const datetimes = matchesWithRealDates.map(m => new Date(m.matchDatetime)).sort();
        const firstDate = datetimes[0].toLocaleDateString('it-IT');
        const lastDate = datetimes[datetimes.length - 1].toLocaleDateString('it-IT');
        console.log(`📅 Range date reali: ${firstDate} - ${lastDate}`);
    }
    
    await browser.close();
    return matchesWithRealDates;
}

// Funzione per estrarre match dall'API (CON PATH CORRETTI)
async function extractAPIMatches(league) {
    console.log(`🔍 Download API ${league.name}...`);
    
    return new Promise((resolve, reject) => {
        https.get(league.url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    
                    const leagueMatches = jsonData.filter(match => 
                        match.league && 
                        match.league.name && 
                        match.type === "matchup" &&
                        match.participants && 
                        match.participants.length > 0 &&
                        !match.participants[0].name.includes("Home Teams")
                    );
                    
                    // Converti nel formato standard CON PATH CORRETTI
                    const matches = leagueMatches.map(match => {
                        const home = match.participants.find(p => p.alignment === 'home');
                        const away = match.participants.find(p => p.alignment === 'away');
                        
                        // Costruisci URL CORRETTO usando il path del campionato
                        const urlPath = `${league.path}${home.name.toLowerCase().replace(/\s+/g, '-')}-vs-${away.name.toLowerCase().replace(/\s+/g, '-')}/${match.id}/`;
                        
                        return {
                            teams: `${home.name} vs ${away.name}`,
                            matchId: match.id,
                            matchDatetime: new Date(match.startTime).toISOString(),
                            url: `https://www.pinnacle.com${urlPath}`
                        };
                    });
                    
                    matches.sort((a, b) => a.matchDatetime.localeCompare(b.matchDatetime));
                    resolve(matches);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// Estrai quote per un match
async function extractOddsForMatch(page, match) {
    try {
        await page.goto(match.url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const pageLoaded = await page.evaluate(() => {
            const titleElements = document.querySelectorAll('.titleText-BgvECQYfHf');
            return titleElements.length > 0;
        });
        
        if (!pageLoaded) {
            return { success: false, error: 'Pagina non caricata correttamente' };
        }
        
        // Show All e See More
        const showAllClicked = await page.evaluate(() => {
            const selectors = [
                'button[class*="showAll"]',
                'div[class*="showAll"]',
                '[class*="showAllButton"]'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    element.click();
                    return true;
                }
            }
            return false;
        });
        
        if (showAllClicked) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        for (let attempt = 0; attempt < 5; attempt++) {
            const seeMoreClicked = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                for (const button of buttons) {
                    const text = button.textContent.toLowerCase();
                    if (text.includes('see more')) {
                        button.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (seeMoreClicked) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                break;
            }
        }
        
        const matchData = await page.evaluate(() => {
            const data = {
                quote1x2: [],
                totalMatch: [],
                bothTeamsToScore: [],
                correctScore: []
            };
            
            // 1X2
            const moneylineSelectors = [
                '[data-test-id="moneyline"] .price-r5BU0ynJha',
                '.moneyline .price-r5BU0ynJha',
                '[class*="moneyline"] .price-r5BU0ynJha'
            ];
            
            document.querySelectorAll(moneylineSelectors.join(',')).forEach(elem => {
                const price = elem.textContent.trim();
                if (price && data.quote1x2.length < 3) {
                    data.quote1x2.push(price);
                }
            });
            
            // BTTS
            const bttsContainers = document.querySelectorAll('.titleText-BgvECQYfHf');
            bttsContainers.forEach(titleText => {
                const title = titleText.textContent.trim();
                if (title === 'Both Teams To Score?') {
                    const container = titleText.closest('[data-test-id]');
                    if (container) {
                        const buttons = container.querySelectorAll('.buttonWrapper-ofFCIiahBj');
                        buttons.forEach((elem, index) => {
                            if (index < 2) {
                                const label = elem.querySelector('.label-GT4CkXEOFj')?.textContent.trim();
                                const price = elem.querySelector('.price-r5BU0ynJha')?.textContent.trim();
                                if (label && price && (label === 'Yes' || label === 'No')) {
                                    data.bothTeamsToScore.push({ tipo: label, quota: price });
                                }
                            }
                        });
                    }
                }
            });
            
            // Correct Score
            const scoreContainers = document.querySelectorAll('.titleText-BgvECQYfHf');
            scoreContainers.forEach(titleText => {
                if (titleText.textContent.includes('Correct Score')) {
                    const container = titleText.closest('[data-test-id]');
                    if (container) {
                        container.querySelectorAll('.buttonWrapper-ofFCIiahBj').forEach(elem => {
                            const label = elem.querySelector('.label-GT4CkXEOFj')?.textContent.trim();
                            const price = elem.querySelector('.price-r5BU0ynJha')?.textContent.trim();
                            if (label && price) {
                                const parts = label.split(',');
                                if (parts.length === 2) {
                                    const firstNumber = parts[0].trim().split(' ').pop();
                                    const secondNumber = parts[1].trim().split(' ').pop();
                                    const cleanLabel = `${firstNumber} - ${secondNumber}`;
                                    data.correctScore.push({ tipo: cleanLabel, quota: price });
                                } else {
                                    data.correctScore.push({ tipo: label, quota: price });
                                }
                            }
                        });
                    }
                }
            });
            
            return data;
        });
        
        // Total Match
        const totalMatchResult = await page.evaluate(() => {
            const allContainers = document.querySelectorAll('[data-test-id], .marketGroup-wMlWprW2iC');
            let totalMatchOdds = [];
            
            allContainers.forEach((container) => {
                const title = container.querySelector('.titleText-BgvECQYfHf')?.textContent.trim() || '';
                
                if (title === 'Total – Match') {
                    const buttons = container.querySelectorAll('.buttonWrapper-ofFCIiahBj');
                    
                    buttons.forEach(elem => {
                        const label = elem.querySelector('.label-GT4CkXEOFj')?.textContent.trim() || 
                                     elem.querySelector('button')?.getAttribute('title')?.trim();
                        const price = elem.querySelector('.price-r5BU0ynJha')?.textContent.trim();
                        
                        if (label && price && 
                            (label.includes('Over') || label.includes('Under')) &&
                            !label.includes('&') && 
                            !label.includes('Team') &&
                            !label.includes('Odd') &&
                            !label.includes('Even') &&
                            !label.includes('Corner') &&
                            !label.includes('Booking') &&
                            !label.includes('Card') &&
                            !label.includes('Corners')) {
                            
                            totalMatchOdds.push({ tipo: label, quota: price });
                        }
                    });
                }
            });
            
            return totalMatchOdds;
        });
        
        matchData.totalMatch = totalMatchResult;
        
        return {
            success: true,
            matchData: matchData
        };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Cleanup vecchi dati
async function cleanupOldData() {
    try {
        console.log('🧹 Verifica cleanup dati...');
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.cleanup.retentionDays);
        
        const { error } = await supabase
            .from('odds_snapshots')
            .delete()
            .lt('timestamp', cutoffDate.toISOString());

        if (error) {
            console.log('⚠️ Errore durante cleanup:', error);
        } else {
            console.log('✅ Cleanup completato');
        }
    } catch (error) {
        console.error('❌ Errore cleanup:', error.message);
    }
}

// Funzione principale di scraping
async function runSupabaseScraping() {
    console.log('🚀 INIZIO SCRAPING - URL CORRETTI + CORRECT SCORE');
    console.log(`📋 Campionati: ${LEAGUES_TO_PROCESS.map(l => l.name).join(', ')}`);
    
    // Configurazione Puppeteer per GitHub Actions
    const puppeteerOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    
    // Su GitHub Actions, specifica il path di Chrome
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    const browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();
    
    const summary = {
        totalMatches: 0,
        successInserts: 0,
        failedInserts: 0,
        totalSnapshots: 0,
        totalCorrectScores: 0,
        errors: []
    };
    
    for (const league of LEAGUES_TO_PROCESS) {
        console.log(`\n=== 🏆 PROCESSANDO ${league.name.toUpperCase()} ===`);
        console.log(`🔗 Path: ${league.path}`);
        
        try {
            // FASE 1: Estrai match
            let matches;
            if (league.extractionMethod === 'dynamic') {
                matches = await extractDynamicMatches(league);
            } else {
                matches = await extractAPIMatches(league);
            }
            
            console.log(`✅ Trovate ${matches.length} partite ${league.name}`);
            
            // Mostra range datetime per questo campionato
            if (matches.length > 0) {
                const datetimes = matches.map(m => new Date(m.matchDatetime)).sort();
                const firstDate = datetimes[0].toLocaleDateString('it-IT');
                const lastDate = datetimes[datetimes.length - 1].toLocaleDateString('it-IT');
                console.log(`📅 Range date: ${firstDate} - ${lastDate}`);
            }
            
            summary.totalMatches += matches.length;
            
            // FASE 2: Processa ogni match
            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const matchDateTime = new Date(match.matchDatetime);
                const dateStr = matchDateTime.toLocaleDateString('it-IT');
                const timeStr = matchDateTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                
                console.log(`🏆 Processando ${i + 1}/${matches.length}: ${match.teams} (${dateStr} ${timeStr})`);
                
                const result = await extractOddsForMatch(page, match);
                
                if (result.success) {
                    const matchData = {
                        matchId: parseInt(match.matchId),
                        teams: match.teams,
                        matchDatetime: match.matchDatetime,
                        url: match.url,
                        quote1x2: {
                            casa: result.matchData.quote1x2[0] || "N/A",
                            pareggio: result.matchData.quote1x2[1] || "N/A", 
                            trasferta: result.matchData.quote1x2[2] || "N/A"
                        },
                        totalMatch: result.matchData.totalMatch,
                        bothTeamsToScore: result.matchData.bothTeamsToScore,
                        correctScore: result.matchData.correctScore
                    };
                    
                    const insertResult = await insertMatchWithRetry(matchData);
                    
                    if (insertResult.success) {
                        summary.successInserts++;
                        summary.totalSnapshots++;
                        
                        // Conta correct score
                        if (matchData.correctScore) {
                            summary.totalCorrectScores += matchData.correctScore.length;
                        }
                        
                        console.log(`   ✅ Salvato 1 snapshot completo in Supabase`);
                        if (matchData.correctScore && matchData.correctScore.length > 0) {
                            console.log(`   🎯 ${matchData.correctScore.length} correct score trovati!`);
                        }
                    } else {
                        summary.failedInserts++;
                        summary.errors.push({
                            match: match.teams,
                            error: insertResult.error
                        });
                        console.log(`   ❌ Errore salvataggio: ${insertResult.error}`);
                    }
                } else {
                    summary.failedInserts++;
                    summary.errors.push({
                        match: match.teams,
                        error: result.error
                    });
                    console.log(`   ❌ Errore estrazione: ${result.error}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
        } catch (error) {
            console.log(`❌ Errore processando ${league.name}:`, error.message);
            summary.errors.push({
                league: league.name,
                error: error.message
            });
        }
    }
    
    await browser.close();
    
    // Cleanup periodico
    await cleanupOldData();
    
    // Report finale
    console.log('\n=== 📊 RIEPILOGO FINALE ===');
    console.log(`📊 Totale match processati: ${summary.totalMatches}`);
    console.log(`✅ Inserimenti riusciti: ${summary.successInserts}`);
    console.log(`❌ Inserimenti falliti: ${summary.failedInserts}`);
    console.log(`📈 Total snapshots: ${summary.totalSnapshots}`);
    console.log(`🎯 Total correct scores: ${summary.totalCorrectScores}`);
    console.log(`📈 Success rate: ${((summary.successInserts / summary.totalMatches) * 100).toFixed(1)}%`);
    
    if (summary.errors.length > 0) {
        console.log('\n❌ Errori:');
        summary.errors.forEach(err => {
            console.log(`   • ${err.match || err.league}: ${err.error}`);
        });
        
        // Salva errori su file
        const errorLog = {
            timestamp: new Date().toISOString(),
            summary: summary,
            errors: summary.errors
        };
        fs.writeFileSync('supabase_scraper_fixed_urls_errors.json', JSON.stringify(errorLog, null, 2));
        console.log('💾 Errori salvati in supabase_scraper_fixed_urls_errors.json');
    }
    
    return summary;
}

// Avvia scheduling
function startScheduling() {
    if (!config.scheduling.enabled) {
        console.log('⏰ Scheduling disabilitato');
        return;
    }
    
    console.log(`⏰ Scheduling attivato: ${config.scheduling.cronPattern}`);
    
    cron.schedule(config.scheduling.cronPattern, async () => {
        console.log(`\n⏰ Esecuzione schedulata: ${new Date().toISOString()}`);
        try {
            await runSupabaseScraping();
        } catch (error) {
            console.error('❌ Errore esecuzione schedulata:', error.message);
        }
    });
    
    console.log('⏰ Scheduler avviato. Premi Ctrl+C per terminare.');
}

// Avvio
async function main() {
    console.log('🚀 Supabase Football Odds Scraper - URL CORRETTI');
    console.log('==============================================');
    
    // Verifica configurazione Supabase
    if (config.supabase.url === 'YOUR_SUPABASE_URL' || config.supabase.anonKey === 'YOUR_SUPABASE_ANON_KEY') {
        console.log('❌ Configurazione Supabase mancante!');
        console.log('📝 Imposta le variabili d\'ambiente SUPABASE_URL e SUPABASE_ANON_KEY');
        console.log('   o modifica il config nello script');
        process.exit(1);
    }
    
    // Test connessione Supabase
    try {
        const { data, error } = await supabase.from('matches').select('count').limit(1);
        if (error) throw error;
        console.log('✅ Connessione Supabase OK');
    } catch (error) {
        console.error('❌ Errore connessione Supabase:', error.message);
        process.exit(1);
    }
    
    // Avvia scheduling
    startScheduling();
    
    // Esegui subito la prima volta
    console.log('🏃 Esecuzione immediata...');
    await runSupabaseScraping();
}

// Gestione uscita
process.on('SIGINT', () => {
    console.log('\n👋 Arresto scraper...');
    process.exit(0);
});

// Avvia
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { runSupabaseScraping, insertMatchWithRetry };
