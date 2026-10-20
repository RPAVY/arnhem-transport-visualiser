/**
 * Arnhem Transport Visualizer
 * Simple server for portfolio demonstration
 * 
 * Fetches GTFS data from OVapi, filters for Arnhem, serves to client
 * 
 * Usage:
 *   npm install
 *   npm start
 *   Open http://localhost:3000
 */

const express = require('express');
const axios = require('axios');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'arnhem-gtfs.json');
const OVAPI_URL = 'http://gtfs.ovapi.nl/gtfs-nl.zip';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Arnhem geographic bounds
const ARNHEM_BOUNDS = {
    minLat: 51.8,
    maxLat: 52.1,
    minLon: 5.7,
    maxLon: 6.2
};

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// =============================================
// CSV Parsing Utilities
// =============================================

function parseCSV(text) {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    
    const headers = parseCSVLine(lines[0]);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const entry = {};
        
        for (let j = 0; j < Math.min(headers.length, values.length); j++) {
            entry[headers[j]] = values[j].trim();
        }
        data.push(entry);
    }
    return data;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// =============================================
// GTFS Filtering
// =============================================

async function extractAndFilter(zipData) {
    console.log('🔍 Filtering GTFS data for Arnhem region...');
    const startTime = Date.now();
    
    const zip = await JSZip.loadAsync(zipData);
    const result = {};
    
    const files = {
        agency: 'agency.txt',
        stops: 'stops.txt',
        routes: 'routes.txt',
        trips: 'trips.txt',
        stop_times: 'stop_times.txt',
        calendar: 'calendar.txt',
        calendar_dates: 'calendar_dates.txt'
    };
    
    // Process stops
    console.log('  → Processing stops...');
    const stopsText = await zip.file(files.stops).async('text');
    const allStops = parseCSV(stopsText);
    const arnhemStopIds = new Set();
    const arnhemStops = [];
    
    for (const stop of allStops) {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        if (!isNaN(lat) && !isNaN(lon) &&
            ARNHEM_BOUNDS.minLat <= lat && lat <= ARNHEM_BOUNDS.maxLat &&
            ARNHEM_BOUNDS.minLon <= lon && lon <= ARNHEM_BOUNDS.maxLon) {
            arnhemStopIds.add(stop.stop_id);
            arnhemStops.push(stop);
        }
    }
    result.stops = arnhemStops;
    
    // Process stop_times
    console.log('  → Processing stop_times...');
    const stopTimesText = await zip.file(files.stop_times).async('text');
    const allStopTimes = parseCSV(stopTimesText);
    const arnhemTripIds = new Set();
    const arnhemStopTimes = [];
    
    for (const st of allStopTimes) {
        if (arnhemStopIds.has(st.stop_id)) {
            arnhemTripIds.add(st.trip_id);
            arnhemStopTimes.push(st);
        }
    }
    result.stop_times = arnhemStopTimes;
    
    // Process trips
    console.log('  → Processing trips...');
    const tripsText = await zip.file(files.trips).async('text');
    const allTrips = parseCSV(tripsText);
    result.trips = allTrips.filter(t => arnhemTripIds.has(t.trip_id));
    
    // Process routes
    console.log('  → Processing routes...');
    const routesText = await zip.file(files.routes).async('text');
    const allRoutes = parseCSV(routesText);
    const arnhemRouteIds = new Set(result.trips.map(t => t.route_id));
    result.routes = allRoutes.filter(r => arnhemRouteIds.has(r.route_id));
    
    // Process remaining files
    console.log('  → Processing remaining files...');
    result.agency = parseCSV(await zip.file(files.agency).async('text'));
    result.calendar = parseCSV(await zip.file(files.calendar).async('text'));
    result.calendar_dates = parseCSV(await zip.file(files.calendar_dates).async('text'));
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`✅ Filtering complete in ${elapsed.toFixed(2)}s`);
    console.log(`   ${result.stops.length} stops, ${result.routes.length} routes, ` +
                `${result.trips.length} trips, ${result.stop_times.length} stop times`);
    
    return result;
}

function saveToCache(data) {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data: data }));
    console.log(`💾 Saved to cache: ${CACHE_FILE}`);
}

function loadFromCache() {
    if (!fs.existsSync(CACHE_FILE)) return null;
    
    try {
        const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const age = Date.now() - cacheData.timestamp;
        
        if (age < CACHE_TTL) {
            console.log(`📋 Cache is valid (${(age / 1000 / 60).toFixed(1)} minutes old)`);
            return cacheData.data;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// =============================================
// API Routes
// =============================================

app.get('/api/gtfs', async (req, res) => {
    const cachedData = loadFromCache();
    if (cachedData) {
        return res.json(cachedData);
    }
    
    console.log('🌐 Fetching from OVapi...');
    
    try {
        const response = await axios.get(OVAPI_URL, {
            responseType: 'arraybuffer',
            timeout: 120000
        });
        
        const filteredData = await extractAndFilter(response.data);
        saveToCache(filteredData);
        
        res.json(filteredData);
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch GTFS data from OVapi' });
    }
});

app.get('/api/gtfs/refresh', async (req, res) => {
    if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
    }
    res.redirect('/api/gtfs');
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log('='.repeat(60));
    console.log('');
    console.log('Open http://localhost:3000 in your browser');
    console.log('');
    console.log('First load will download GTFS data from OVapi (~30-60s)');
    console.log('Subsequent loads use cached data (instant)');
    console.log('');
    console.log('Endpoints:');
    console.log('  GET /                          - Main application');
    console.log('  GET /api/gtfs                  - Get GTFS data');
    console.log('  GET /api/gtfs/refresh          - Refresh GTFS data');
    console.log('  GET /api/health                - Health check');
    console.log('');
    console.log(`Press Ctrl+C to stop`);
    console.log('='.repeat(60));
    
    const cachedData = loadFromCache();
    if (cachedData) {
        console.log('\nℹ️  Valid cache found. Data will be served from cache.');
    } else {
        console.log('\nℹ️  No cache found. Data will be fetched from OVapi on first request.');
    }
});

module.exports = app;
