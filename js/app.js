/**
 * PvP Observer - Main Application
 * FFXIV PvP Player Analyzer
 */

class PvPObserverApp {
    constructor() {
        this.parser = new LiteDBParser();
        this.tierCalculator = new TierCalculator();

        // Data state
        this.rawMatches = [];
        this.allPlayers = [];
        this.displayPlayers = [];
        this.matchHeaders = [];

        // View state
        this.currentView = 'overall'; // 'overall' | 'date-YYYY-MM-DD-matchIndex'
        this.sortColumn = 'tier';
        this.sortAscending = true;
        this.playerLimit = 1000;
        this.expandedDate = null; // Track which date group is expanded

        // Cached statistics for coloring
        this.kdaValues = [];
        this.damageValues = [];

        // Initialize
        this.init();
    }

    init() {
        this.bindEvents();
        console.log('PvP Observer initialized');
    }

    bindEvents() {
        // File upload button
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');

        uploadBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.loadFile(files[0]);
                }
            });
            dropZone.addEventListener('click', () => fileInput?.click());
        }

        // Load demo data button
        document.getElementById('loadDemoBtn')?.addEventListener('click', () => {
            this.loadDemoData();
        });

        // Refresh button
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.processData();
            this.render();
        });

        // Tab clicks
        document.querySelector('.tab-bar')?.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab');
            if (tab) {
                this.switchTab(tab.dataset.tab);
            }
        });

        // Table header sorting
        document.getElementById('playerTable')?.addEventListener('click', (e) => {
            const th = e.target.closest('th.sortable');
            if (th) {
                this.handleSort(th.dataset.sort);
            }
        });
    }

    async loadDemoData() {
        this.showLoading(true);
        this.updateStatus('載入範例資料...', false);

        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error('找不到 data.json 檔案');
            }
            const jsonData = await response.json();

            if (jsonData.flmatch && Array.isArray(jsonData.flmatch)) {
                this.rawMatches = this.normalizeJsonMatches(jsonData.flmatch);
                console.log('Loaded', this.rawMatches.length, 'matches from demo data');

                this.processData();
                this.showDataView();
                this.updateStatus(`已載入 ${this.rawMatches.length} 場比賽`, true);
            } else {
                throw new Error('JSON 格式不正確');
            }
        } catch (error) {
            console.error('Error loading demo data:', error);
            this.updateStatus('載入失敗', false);
            alert('載入範例資料失敗: ' + error.message + '\n\n請確保 data.json 檔案存在於同一目錄。');
        } finally {
            this.showLoading(false);
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            await this.loadFile(file);
        }
    }

    async loadFile(file) {
        console.log('Loading file:', file.name, 'Size:', file.size);

        this.showLoading(true);
        this.updateStatus('載入中...', false);

        try {
            // Check file extension
            const isJson = file.name.toLowerCase().endsWith('.json');

            if (isJson) {
                // Load as JSON (exported data)
                const text = await file.text();
                const jsonData = JSON.parse(text);

                if (jsonData.flmatch && Array.isArray(jsonData.flmatch)) {
                    this.rawMatches = this.normalizeJsonMatches(jsonData.flmatch);
                    console.log('Loaded', this.rawMatches.length, 'matches from JSON');

                    this.processData();
                    this.showDataView();
                    this.updateStatus(`已載入 ${this.rawMatches.length} 場比賽`, true);
                } else {
                    throw new Error('JSON 格式不正確，缺少 flmatch 資料');
                }
            } else {
                // Try to load as LiteDB binary
                const buffer = await file.arrayBuffer();
                const result = await this.parser.parse(buffer);

                if (result.success && result.collections.flmatch?.length > 0) {
                    this.rawMatches = result.collections.flmatch;
                    console.log('Parsed', this.rawMatches.length, 'matches');

                    this.processData();
                    this.showDataView();
                    this.updateStatus(`已載入 ${this.rawMatches.length} 場比賽`, true);
                } else {
                    // LiteDB parsing failed
                    this.updateStatus('無法解析 data.db，請使用轉換工具', false);
                    alert('無法直接解析 data.db 檔案。\n\n請使用 tools/convert-db.ps1 腳本將 data.db 轉換為 data.json，然後上傳 JSON 檔案。\n\n或直接上傳已轉換的 data.json。');
                }
            }
        } catch (error) {
            console.error('Error loading file:', error);
            this.updateStatus('載入失敗: ' + error.message, false);
            alert('載入失敗: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Normalize JSON data from PowerShell export to match expected format
     */
    normalizeJsonMatches(flmatches) {
        return flmatches.map(match => {
            // Normalize Players array
            const players = (match.Players || []).map(p => {
                // Parse player key "Name Server" format
                const keyParts = (p.key || '').split(' ');
                const name = keyParts.slice(0, -1).join(' ') || keyParts[0] || 'Unknown';
                const server = keyParts[keyParts.length - 1] || 'Unknown';

                return {
                    name: name,
                    server: server,
                    kills: p.kills || 0,
                    deaths: p.deaths || 0,
                    assists: p.assists || 0,
                    damage: p.damage || 0,
                    job: p.job || null,
                    team: this.normalizeTeam(p.team, p.alliance)
                };
            });

            return {
                MatchStartTime: match.MatchStartTime,
                PlayerScoreboards: players
            };
        });
    }

    /**
     * Normalize team value to Chinese name
     */
    normalizeTeam(team, alliance) {
        // Handle numeric team/alliance values
        const teamNum = typeof team === 'number' ? team : (typeof alliance === 'number' ? alliance : -1);

        if (teamNum === 0 || team === 'Maelstrom') return '黑渦團';
        if (teamNum === 1 || team === 'Adders') return '雙蛇黨';
        if (teamNum === 2 || team === 'Flames') return '恆輝隊';

        return team || '';
    }

    async tryFallbackParsing(buffer) {
        // Fallback: Extract readable strings and try to find match data
        const bytes = new Uint8Array(buffer);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

        // Look for patterns in the binary
        const matchCount = (text.match(/PlayerScoreboards/g) || []).length;

        if (matchCount > 0) {
            console.log('Found approximately', matchCount, 'matches via pattern matching');

            // For now, generate sample data for demonstration
            this.rawMatches = this.extractMatchesFromBinary(bytes);

            if (this.rawMatches.length > 0) {
                this.processData();
                this.showDataView();
                this.updateStatus(`已載入 ${this.rawMatches.length} 場比賽 (解析模式)`, true);
            } else {
                this.updateStatus('無法解析檔案格式', false);
            }
        } else {
            this.updateStatus('檔案格式不正確或無資料', false);
        }
    }

    /**
     * Extract match data from binary using pattern matching
     */
    extractMatchesFromBinary(bytes) {
        const matches = [];
        const textDecoder = new TextDecoder('utf-8', { fatal: false });

        // Find "MatchStartTime" occurrences to locate match boundaries
        const matchStartPattern = this.stringToBytes('MatchStartTime');
        const playerScoreboardsPattern = this.stringToBytes('PlayerScoreboards');

        let searchPos = 0;
        const maxMatches = 200;

        while (searchPos < bytes.length && matches.length < maxMatches) {
            // Find next MatchStartTime
            const matchTimePos = this.findPattern(bytes, matchStartPattern, searchPos);
            if (matchTimePos === -1) break;

            // Find PlayerScoreboards near this match
            const scoreboardPos = this.findPattern(bytes, playerScoreboardsPattern,
                Math.max(0, matchTimePos - 1000), matchTimePos + 5000);

            if (scoreboardPos !== -1) {
                // Try to extract match data
                const match = this.extractSingleMatch(bytes, matchTimePos, scoreboardPos);
                if (match) {
                    matches.push(match);
                }
            }

            searchPos = matchTimePos + 100;
        }

        return matches;
    }

    extractSingleMatch(bytes, timePos, scoreboardPos) {
        try {
            // Extract timestamp (8 bytes after field name + null + type marker)
            const timeValuePos = timePos + 'MatchStartTime'.length + 2;
            const timestamp = this.readInt64LE(bytes, timeValuePos);
            const matchTime = new Date(Number(timestamp));

            // Extract player data from scoreboards
            // This is a simplified extraction - real implementation would need full BSON parsing
            const players = this.extractPlayersFromScoreboard(bytes, scoreboardPos);

            if (players.length > 0) {
                return {
                    MatchStartTime: matchTime,
                    PlayerScoreboards: players,
                    _extracted: true
                };
            }
        } catch (e) {
            console.warn('Failed to extract match:', e);
        }
        return null;
    }

    extractPlayersFromScoreboard(bytes, startPos) {
        const players = [];
        const killsPattern = this.stringToBytes('Kills');
        const deathsPattern = this.stringToBytes('Deaths');
        const assistsPattern = this.stringToBytes('Assists');
        const damagePattern = this.stringToBytes('DamageDealt');

        // Search within a reasonable range
        const endPos = Math.min(bytes.length, startPos + 50000);
        let pos = startPos;

        const seenOffsets = new Set();

        while (pos < endPos && players.length < 72) { // Max 72 players per FL match
            // Find next Kills field
            const killsPos = this.findPattern(bytes, killsPattern, pos, endPos);
            if (killsPos === -1) break;

            // Check we haven't already processed this region
            const regionKey = Math.floor(killsPos / 100) * 100;
            if (seenOffsets.has(regionKey)) {
                pos = killsPos + 10;
                continue;
            }
            seenOffsets.add(regionKey);

            // Try to read stats
            const deathsPos = this.findPattern(bytes, deathsPattern, killsPos, killsPos + 100);
            const assistsPos = this.findPattern(bytes, assistsPattern, killsPos, killsPos + 100);

            if (deathsPos !== -1 && assistsPos !== -1) {
                // Found a valid player record
                const kills = this.readInt32AtField(bytes, killsPos);
                const deaths = this.readInt32AtField(bytes, deathsPos);
                const assists = this.readInt32AtField(bytes, assistsPos);

                // Try to find damage
                const damagePos = this.findPattern(bytes, damagePattern, killsPos, killsPos + 150);
                const damage = damagePos !== -1 ? this.readInt64AtField(bytes, damagePos) : 0;

                // Try to extract player name (look backwards for string)
                const playerName = this.extractPlayerNameNearby(bytes, killsPos);

                if (playerName && kills >= 0 && deaths >= 0) {
                    players.push({
                        name: playerName.name,
                        server: playerName.server,
                        kills,
                        deaths,
                        assists,
                        damage: Number(damage)
                    });
                }
            }

            pos = killsPos + 50;
        }

        return players;
    }

    extractPlayerNameNearby(bytes, fieldPos) {
        // Look backwards for a string that looks like "Name Server" format
        // LiteDB stores strings as: length (4 bytes) + string + null

        const searchStart = Math.max(0, fieldPos - 200);
        const region = bytes.slice(searchStart, fieldPos);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(region);

        // Look for patterns like "PlayerName ServerName" with common server names
        const serverPatterns = [
            'Moogle', 'Chocobo', 'Tonberry', 'Alexander', 'Bahamut', 'Titan',
            'Carbuncle', 'Fenrir', 'Ultima', 'Kujata', 'Typhon', 'Garuda',
            'Atomos', 'Ixion', 'Ramuh', 'Mandragora', 'Asura', 'Pandaemonium',
            'Shinryu', 'Gungnir', 'Masamune', 'Hades', 'Anima', 'Valefor',
            'Yojimbo', 'Zeromus', 'Ridill', 'Durandal', 'Aegis', 'Tiamat',
            'Unicorn', 'Belias', 'Ifrit'
        ];

        for (const server of serverPatterns) {
            const pattern = new RegExp(`([A-Za-z']+)\\s+(${server})`, 'i');
            const match = text.match(pattern);
            if (match) {
                return { name: match[1], server: match[2] };
            }
        }

        // Fallback: use generic extraction
        return null;
    }

    // Utility functions
    stringToBytes(str) {
        return new TextEncoder().encode(str);
    }

    findPattern(bytes, pattern, start = 0, end = bytes.length) {
        end = Math.min(end, bytes.length - pattern.length);
        for (let i = start; i <= end; i++) {
            let match = true;
            for (let j = 0; j < pattern.length; j++) {
                if (bytes[i + j] !== pattern[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return i;
        }
        return -1;
    }

    readInt32LE(bytes, offset) {
        if (offset + 4 > bytes.length) return 0;
        return bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24);
    }

    readInt64LE(bytes, offset) {
        if (offset + 8 > bytes.length) return 0n;
        const low = this.readInt32LE(bytes, offset);
        const high = this.readInt32LE(bytes, offset + 4);
        return BigInt(low) + (BigInt(high) << 32n);
    }

    readInt32AtField(bytes, fieldPos) {
        // Field format: name + null + type (0x10 for int32) + value
        // Position after field name
        const nameEndPos = fieldPos + this.stringToBytes('Kills').length;
        // Skip null terminator and type byte
        return this.readInt32LE(bytes, nameEndPos + 2);
    }

    readInt64AtField(bytes, fieldPos) {
        const nameLen = 'DamageDealt'.length;
        return this.readInt64LE(bytes, fieldPos + nameLen + 2);
    }

    /**
     * Parse MatchStartTime which may be in various formats:
     * - Standard ISO date string: "2025-12-07T06:48:01Z"
     * - LiteDB BSON serialized: "{\"$date\":\"2025-12-07T06:48:01.6530000Z\"}"
     */
    parseMatchTime(timeValue) {
        if (!timeValue) return new Date(0);

        if (typeof timeValue === 'string') {
            // Check if it's a BSON serialized date format
            if (timeValue.includes('$date')) {
                try {
                    // Extract the date string from BSON format
                    const match = timeValue.match(/"?\$date"?\s*:\s*"([^"]+)"/);
                    if (match && match[1]) {
                        return new Date(match[1]);
                    }
                } catch (e) {
                    console.warn('Failed to parse BSON date:', timeValue);
                }
            }
            // Normal ISO string
            return new Date(timeValue);
        }

        // If it's already a Date or number
        return new Date(timeValue);
    }

    /**
     * Process raw match data into player statistics
     */
    processData() {
        if (this.rawMatches.length === 0) return;

        // Extract match headers - group by date for last 10 days
        const sortedMatches = this.rawMatches
            .filter(m => m.MatchStartTime)
            .map(m => ({ ...m, parsedTime: this.parseMatchTime(m.MatchStartTime) }))
            .sort((a, b) => b.parsedTime - a.parsedTime);

        // Get unique dates from last 10 days
        const dateMap = new Map();
        const now = new Date();
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

        sortedMatches.forEach((match, index) => {
            if (match.parsedTime < tenDaysAgo) return;

            const dateKey = this.formatDateKey(match.parsedTime);
            if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, []);
            }
            dateMap.get(dateKey).push({ ...match, globalIndex: index });
        });

        // Convert to array and sort by date (newest first)
        this.matchHeaders = Array.from(dateMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([dateKey, matches]) => ({ dateKey, matches }));

        // Aggregate player statistics
        const playerMap = new Map();

        // Process last 200 matches for player stats
        const recentMatches = this.rawMatches
            .filter(m => m.MatchStartTime)
            .sort((a, b) => this.parseMatchTime(b.MatchStartTime) - this.parseMatchTime(a.MatchStartTime))
            .slice(0, 200);

        recentMatches.forEach(match => {
            const players = match.PlayerScoreboards || [];

            players.forEach(player => {
                if (!player.name) return;

                const key = `${player.name}@${player.server || 'Unknown'}`;

                if (!playerMap.has(key)) {
                    playerMap.set(key, {
                        name: player.name,
                        server: player.server || 'Unknown',
                        fullName: key,
                        flMatches: 0,
                        totalKills: 0,
                        totalDeaths: 0,
                        totalAssists: 0,
                        totalDamage: 0,
                        jobCounts: {},
                        tier: null,
                        tierScore: 0
                    });
                }

                const stats = playerMap.get(key);
                stats.flMatches++;
                stats.totalKills += player.kills || 0;
                stats.totalDeaths += player.deaths || 0;
                stats.totalAssists += player.assists || 0;
                stats.totalDamage += player.damage || 0;

                if (player.job) {
                    stats.jobCounts[player.job] = (stats.jobCounts[player.job] || 0) + 1;
                }
            });
        });

        // Calculate derived stats
        this.allPlayers = Array.from(playerMap.values()).map(player => {
            // KDA
            player.kda = player.totalDeaths > 0
                ? (player.totalKills + player.totalAssists) / player.totalDeaths
                : player.totalKills + player.totalAssists;

            // Average damage
            player.avgDamage = player.flMatches > 0
                ? player.totalDamage / player.flMatches
                : 0;

            // Most played job
            player.mostPlayedJob = this.getMostPlayedJob(player.jobCounts);

            return player;
        });

        // Calculate tiers
        this.allPlayers = this.tierCalculator.calculateTiers(this.allPlayers);

        // Cache values for color calculations
        this.kdaValues = this.allPlayers
            .filter(p => p.flMatches >= 3)
            .map(p => p.kda)
            .sort((a, b) => a - b);

        this.damageValues = this.allPlayers
            .filter(p => p.flMatches >= 3)
            .map(p => p.avgDamage)
            .sort((a, b) => a - b);

        // Sort by tier and matches (no limit - user controls display limit)
        this.allPlayers = this.allPlayers
            .sort((a, b) => {
                // Sort by tier first (T0 = 1, lower number = better)
                const tierDiff = (a.tier ? this.tierToNum(a.tier) : 99) - (b.tier ? this.tierToNum(b.tier) : 99);
                if (tierDiff !== 0) return tierDiff;
                // Then by matches
                return b.flMatches - a.flMatches;
            });

        // Update display
        this.updateDisplayPlayers();
        this.render();
        this.updateStats();
    }

    getMostPlayedJob(jobCounts) {
        if (!jobCounts || Object.keys(jobCounts).length === 0) {
            return '未知';
        }
        return Object.entries(jobCounts)
            .sort((a, b) => b[1] - a[1])[0][0];
    }

    updateDisplayPlayers() {
        if (this.currentView === 'overall') {
            // Apply player limit for overall stats view
            this.displayPlayers = this.allPlayers.slice(0, this.playerLimit);
        } else if (this.currentView.startsWith('date-')) {
            // Parse date-YYYY-MM-DD-index format
            const parts = this.currentView.split('-');
            const matchIndex = parseInt(parts[parts.length - 1]);
            this.displayPlayers = this.getMatchPlayers(matchIndex);
        }

        this.sortDisplayPlayers();
    }

    getMatchPlayers(matchIndex) {
        if (matchIndex >= this.rawMatches.length) return [];

        const sortedMatches = this.rawMatches
            .filter(m => m.MatchStartTime)
            .sort((a, b) => this.parseMatchTime(b.MatchStartTime) - this.parseMatchTime(a.MatchStartTime));

        const match = sortedMatches[matchIndex];
        if (!match?.PlayerScoreboards) return [];

        // Map match players to single-match stats (not cumulative)
        const playerLookup = new Map(this.allPlayers.map(p => [p.fullName, p]));

        return match.PlayerScoreboards.map(player => {
            const key = `${player.name}@${player.server || 'Unknown'}`;
            const fullStats = playerLookup.get(key);

            // Calculate single-match KDA
            const kills = player.kills || 0;
            const deaths = player.deaths || 0;
            const assists = player.assists || 0;
            const damage = player.damage || 0;
            const matchKda = deaths > 0 ? (kills + assists) / deaths : kills + assists;

            return {
                name: player.name,
                server: player.server || 'Unknown',
                fullName: key,
                // Use overall tier for reference
                tier: fullStats?.tier || null,
                tierScore: fullStats?.tierScore || 0,
                // Single match stats
                matchKills: kills,
                matchDeaths: deaths,
                matchAssists: assists,
                matchKda: matchKda,
                matchDamage: damage,
                matchJob: player.job || '未知',
                team: player.team || '',
                // Overall stats for reference
                flMatches: fullStats?.flMatches || 0,
                kda: fullStats?.kda || 0,
                avgDamage: fullStats?.avgDamage || 0,
                mostPlayedJob: fullStats?.mostPlayedJob || '未知'
            };
        });
    }

    sortDisplayPlayers() {
        const col = this.sortColumn;
        const asc = this.sortAscending;

        this.displayPlayers.sort((a, b) => {
            let valA, valB;

            switch (col) {
                case 'tier':
                    // Sort by tier (T0 first), then by tierScore
                    valA = a.tier ? this.tierToNum(a.tier) : 99;
                    valB = b.tier ? this.tierToNum(b.tier) : 99;
                    if (valA !== valB) return asc ? valA - valB : valB - valA;
                    return asc ? a.tierScore - b.tierScore : b.tierScore - a.tierScore;

                case 'team':
                    valA = a.team || '';
                    valB = b.team || '';
                    return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);

                case 'name':
                    return asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);

                case 'matches':
                    return asc ? a.flMatches - b.flMatches : b.flMatches - a.flMatches;

                case 'kda':
                    return asc ? a.kda - b.kda : b.kda - a.kda;

                case 'damage':
                    return asc ? a.avgDamage - b.avgDamage : b.avgDamage - a.avgDamage;

                case 'job':
                    return asc
                        ? a.mostPlayedJob.localeCompare(b.mostPlayedJob)
                        : b.mostPlayedJob.localeCompare(a.mostPlayedJob);

                default:
                    return 0;
            }
        });
    }

    tierToNum(tier) {
        const map = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };
        return map[tier] ?? 99;
    }

    handleSort(column) {
        if (this.sortColumn === column) {
            this.sortAscending = !this.sortAscending;
        } else {
            this.sortColumn = column;
            this.sortAscending = column === 'name' || column === 'tier';
        }

        this.sortDisplayPlayers();
        this.render();
        this.updateSortIndicators();
    }

    updateSortIndicators() {
        document.querySelectorAll('.player-table th.sortable').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === this.sortColumn) {
                th.classList.add(this.sortAscending ? 'asc' : 'desc');
            }
        });
    }

    switchTab(tabId) {
        this.currentView = tabId;

        // Update tab styles
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        // Show/hide team column
        const isMatchView = tabId.startsWith('date-');
        document.querySelectorAll('.team-col').forEach(el => {
            el.classList.toggle('hidden', !isMatchView);
        });

        this.updateDisplayPlayers();
        this.render();
        this.updateStats();
    }

    showDataView() {
        document.getElementById('welcomeScreen')?.classList.add('hidden');
        document.getElementById('dataView')?.classList.remove('hidden');

        // Create match tabs
        this.createMatchTabs();
    }

    createMatchTabs() {
        const container = document.getElementById('matchTabs');
        if (!container) return;

        // Create collapsible date tabs - only show dates initially
        container.innerHTML = this.matchHeaders.map(({ dateKey, matches }) => {
            const dateStr = this.formatDateDisplay(dateKey);
            const isToday = dateKey === this.formatDateKey(new Date());
            const dateLabel = isToday ? '今天' : dateStr;
            const isExpanded = this.expandedDate === dateKey;

            // Create submenu for times (hidden by default)
            const timeTabs = matches.map((match, i) => {
                const timeStr = this.formatTimeOnly(match.parsedTime);
                const tabId = `date-${dateKey}-${match.globalIndex}`;
                const isActive = this.currentView === tabId;
                return `<button class="tab time-tab ${isActive ? 'active' : ''}" data-tab="${tabId}">
                    ${timeStr}
                </button>`;
            }).join('');

            return `<div class="match-date-group ${isExpanded ? 'expanded' : ''}" data-date="${dateKey}">
                <button class="tab date-tab" data-date-toggle="${dateKey}">
                    <span class="tab-icon">📅</span>
                    ${dateLabel}
                    <span class="match-count">(${matches.length})</span>
                    <span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>
                </button>
                <div class="match-time-tabs ${isExpanded ? '' : 'hidden'}">${timeTabs}</div>
            </div>`;
        }).join('');

        // Add click handlers for date toggles
        container.querySelectorAll('[data-date-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                const dateKey = btn.getAttribute('data-date-toggle');
                this.toggleDateGroup(dateKey);
            });
        });
    }

    toggleDateGroup(dateKey) {
        // Toggle expanded state
        if (this.expandedDate === dateKey) {
            this.expandedDate = null;
        } else {
            this.expandedDate = dateKey;
        }
        this.createMatchTabs();
    }

    formatMatchTime(date) {
        if (!date || isNaN(date.getTime())) return '未知';
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hour = date.getHours().toString().padStart(2, '0');
        const min = date.getMinutes().toString().padStart(2, '0');
        return `${month}/${day} ${hour}:${min}`;
    }

    formatDateKey(date) {
        if (!date) return '';
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatDateDisplay(dateKey) {
        const [year, month, day] = dateKey.split('-');
        return `${month}/${day}`;
    }

    formatTimeOnly(date) {
        if (!date || isNaN(date.getTime())) return '未知';
        const hour = date.getHours().toString().padStart(2, '0');
        const min = date.getMinutes().toString().padStart(2, '0');
        return `${hour}:${min}`;
    }

    render() {
        const tbody = document.getElementById('playerTableBody');
        if (!tbody) return;

        const isMatchView = this.currentView.startsWith('date-');

        tbody.innerHTML = this.displayPlayers.map(player => {
            const tierClass = this.tierCalculator.getTierClass(player.tier);

            // For match view: use match-specific stats; for overall: use cumulative stats
            if (isMatchView) {
                // Single match data
                const kdaDisplay = player.matchKda?.toFixed(1) || '-';
                const damageDisplay = player.matchDamage > 0 ? (player.matchDamage / 10000).toFixed(1) : '-';
                const jobDisplay = player.matchJob || '未知';

                return `
                    <tr>
                        <td>
                            ${player.tier
                        ? `<span class="tier-badge ${tierClass}" data-tooltip="Score: ${player.tierScore?.toFixed(1) || 0}">${player.tier}</span>`
                        : `<span class="tier-none">-</span>`
                    }
                        </td>
                        <td class="team-col">${this.renderTeamBadge(player.team)}</td>
                        <td class="name-col">
                            <span class="player-name">${this.escapeHtml(player.name)}</span>
                            <span class="player-server">${this.escapeHtml(player.server)}</span>
                        </td>
                        <td class="stat-kda" data-tooltip="K:${player.matchKills || 0} D:${player.matchDeaths || 0} A:${player.matchAssists || 0}">
                            ${kdaDisplay}
                        </td>
                        <td class="stat-damage" data-tooltip="${this.formatNumber(player.matchDamage || 0)}">
                            ${damageDisplay}
                        </td>
                        <td><span class="job-badge">${this.escapeHtml(jobDisplay)}</span></td>
                    </tr>
                `;
            } else {
                // Overall cumulative data
                const kdaClass = this.tierCalculator.getKdaClass(player.kda, this.kdaValues);
                const dmgClass = this.tierCalculator.getDamageClass(player.avgDamage, this.damageValues);
                const matchesClass = player.flMatches > 10 ? 'highlight' : '';
                const jobDisplay = player.mostPlayedJob || '未知';

                return `
                    <tr>
                        <td>
                            ${player.tier
                        ? `<span class="tier-badge ${tierClass}" data-tooltip="Score: ${player.tierScore?.toFixed(1) || 0}">${player.tier}</span>`
                        : `<span class="tier-none">-</span>`
                    }
                        </td>
                        <td class="name-col">
                            <span class="player-name">${this.escapeHtml(player.name)}</span>
                            <span class="player-server">${this.escapeHtml(player.server)}</span>
                        </td>
                        <td class="stat-matches ${matchesClass}">${player.flMatches || '-'}</td>
                        <td class="stat-kda ${kdaClass}" data-tooltip="K:${player.totalKills || 0} D:${player.totalDeaths || 0} A:${player.totalAssists || 0}">
                            ${player.kda?.toFixed(1) || '-'}
                        </td>
                        <td class="stat-damage ${dmgClass}" data-tooltip="${this.formatNumber(player.avgDamage || 0)}">
                            ${player.avgDamage > 0 ? (player.avgDamage / 10000).toFixed(0) : '-'}
                        </td>
                        <td><span class="job-badge">${this.escapeHtml(jobDisplay)}</span></td>
                    </tr>
                `;
            }
        }).join('');

        this.updateSortIndicators();
        this.updateTableHeaders();
    }

    updateTableHeaders() {
        const isMatchView = this.currentView.startsWith('date-');
        const thead = document.querySelector('#playerTable thead tr');
        if (!thead) return;

        // Update header visibility
        document.querySelectorAll('.team-col').forEach(el => {
            el.classList.toggle('hidden', !isMatchView);
        });

        // Update header text for match view
        const matchesHeader = thead.querySelector('[data-sort="matches"]');
        if (matchesHeader) {
            matchesHeader.classList.toggle('hidden', isMatchView);
        }
    }

    renderTeamBadge(team) {
        if (!team) return '-';

        const teamMap = {
            '黑渦團': { class: 'team-red', text: '紅' },
            'Maelstrom': { class: 'team-red', text: '紅' },
            '雙蛇黨': { class: 'team-yellow', text: '黃' },
            'Adders': { class: 'team-yellow', text: '黃' },
            '恆輝隊': { class: 'team-blue', text: '藍' },
            'Flames': { class: 'team-blue', text: '藍' }
        };

        const info = teamMap[team];
        if (info) {
            return `<span class="team-badge ${info.class}">${info.text}</span>`;
        }
        return team;
    }

    updateStats() {
        document.getElementById('totalPlayerCount').textContent = this.allPlayers.length;
        document.getElementById('matchCount').textContent = this.rawMatches.length;
    }

    updateStatus(text, connected) {
        const statusEl = document.getElementById('dbStatus');
        const textEl = statusEl?.querySelector('.status-text');

        if (statusEl) {
            statusEl.classList.toggle('connected', connected);
        }
        if (textEl) {
            textEl.textContent = text;
        }
    }

    showLoading(show) {
        document.getElementById('loadingOverlay')?.classList.toggle('hidden', !show);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    formatNumber(num) {
        return new Intl.NumberFormat('zh-TW').format(Math.round(num));
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PvPObserverApp();
});
