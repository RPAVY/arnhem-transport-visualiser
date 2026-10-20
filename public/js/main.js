// Arnhem Transport Visualizer
// Now uses server-side API to fetch GTFS data from OVapi
// No local storage required!

let map;
let markers = { bus: [], train: [], stops: [] };
let gtfsParser = null;
let selectedBusLines = new Set();
let selectedTrainLines = new Set();
let activeTransportTypes = new Set(['bus']); // Default: show bus

const COLORS = { 
    bus: '#1f78b4', 
    train: '#e377c2', 
    stop: '#ff7f00' 
};
const ARNHEM_CENTER = [51.985, 5.898];

async function init() {
    console.log('Initializing application...');
    createMap();
    setupControls();
    
    // Load data from API
    await loadData();
}

function createMap() {
    // Create map with a better tile layer that includes satellite view
    map = L.map('map', {
        preferCanvas: true
    }).setView(ARNHEM_CENTER, 13);
    
    // Use OpenStreetMap standard tiles (works without API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Add satellite layer option (ESRI satellite - works without API key)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });
    
    // Add layer control to switch between map and satellite
    const baseLayers = {
        'Standard': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        'Satellite': satelliteLayer
    };
    
    L.control.layers(baseLayers).addTo(map);
    
    L.marker(ARNHEM_CENTER, { title: 'Arnhem Center' })
        .addTo(map)
        .bindPopup('Arnhem - Netherlands');
}

async function loadData() {
    const loadingElement = document.getElementById('loading');
    const progressElement = document.getElementById('progress-bar');
    
    // Show loading message
    if (loadingElement) {
        loadingElement.innerHTML = '<p>Loading GTFS data from server...</p>';
        loadingElement.classList.remove('hidden');
    }
    
    console.log('Loading GTFS data from API...');
    
    try {
        gtfsParser = new GTFSParser();
        const loaded = await gtfsParser.loadGTFSData('arnhem');

        if (!loaded) {
            throw new Error('Failed to load GTFS data from API');
        }

        // Update loading progress
        if (progressElement) {
            progressElement.value = 100;
        }
        
        // Display stops
        displayStopsForLines(gtfsParser.stops, null);
        
        // Update vehicle positions with current time
        const timeRange = document.getElementById('time-range');
        if (timeRange && gtfsParser) {
            const hours = parseInt(timeRange.value);
            await updateVehiclePositions(hours, 0);
        }
        
        console.log(`Data loaded: ${gtfsParser.stops.length} stops, ${gtfsParser.routes.length} routes`);
        
        // Hide loading screen
        if (loadingElement) {
            loadingElement.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Loading error:', error);
        
        if (loadingElement) {
            loadingElement.innerHTML = `
                <p style="color: red;">Error: Unable to load GTFS data.</p>
                <p>Please ensure the server is running: <code>npm start</code></p>
                <p>The server will download and filter data from OVapi automatically.</p>
                <p>If you just started the server, wait a moment and refresh the page.</p>
                <p><a href="/api/cache/status" target="_blank">Check cache status</a></p>
            `;
            loadingElement.classList.remove('hidden');
        }
    }
}

function displayStops(stops) {
    displayStopsForLines(stops, null);
}

function updateStopsForTransportTypes() {
    if (!gtfsParser) return;
    
    const busToggle = document.getElementById('toggle-bus');
    const trainToggle = document.getElementById('toggle-train');
    
    // Both active - show all stops
    if (busToggle.classList.contains('active') && trainToggle.classList.contains('active')) {
        displayStopsForLines(gtfsParser.stops, null);
        return;
    }
    
    // Only bus active - show bus stops only
    if (busToggle.classList.contains('active') && !trainToggle.classList.contains('active')) {
        const busStops = gtfsParser.getStopsForTransportType('bus');
        displayStopsForLines(busStops, null);
        return;
    }
    
    // Only train active - show train stops only
    if (!busToggle.classList.contains('active') && trainToggle.classList.contains('active')) {
        const trainStops = gtfsParser.getStopsForTransportType('train');
        displayStopsForLines(trainStops, null);
        return;
    }
    
    // Neither active - clear stops and counts
    clearMarkers('stops');
    const busStopCountEl = document.getElementById('bus-stop-count');
    const trainStopCountEl = document.getElementById('train-stop-count');
    const stopCountEl = document.getElementById('stop-count');
    
    if (busStopCountEl) busStopCountEl.textContent = 'Bus Stops: 0';
    if (trainStopCountEl) trainStopCountEl.textContent = 'Train Stops: 0';
    if (stopCountEl) stopCountEl.textContent = 'Stops: 0';
}

function displayStopsForLines(stops, lineStopsMap) {
    console.log(`Displaying ${stops.length} stops...`);
    clearMarkers('stops');

    for (const stop of stops) {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        if (isNaN(lat) || isNaN(lon)) continue;

        // Find which lines serve this stop
        let lines = [];
        if (lineStopsMap) {
            for (const [line, lineStops] of lineStopsMap) {
                if (lineStops.some(s => s.stop_id === stop.stop_id)) {
                    lines.push(line);
                }
            }
        }

        const marker = L.circleMarker([lat, lon], {
            radius: 4,
            fillColor: COLORS.stop,
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
            className: 'stop-marker'
        });

        let popupContent = `<b>${stop.stop_name || 'Unnamed Stop'}</b><br>ID: ${stop.stop_id}`;
        if (lines.length > 0) {
            popupContent += `<br>Lines: ${lines.join(', ')}`;
        }
        marker.bindPopup(popupContent).addTo(map);
        markers.stops.push(marker);
    }
    
    // Update stop counts based on active transport types
    const busToggle = document.getElementById('toggle-bus');
    const trainToggle = document.getElementById('toggle-train');
    
    if (busToggle.classList.contains('active') && trainToggle.classList.contains('active')) {
        // Both active - show total
        const stopCountEl = document.getElementById('stop-count');
        if (stopCountEl) stopCountEl.textContent = `Stops: ${stops.length}`;
    } else if (busToggle.classList.contains('active')) {
        // Only bus active
        const busStopCountEl = document.getElementById('bus-stop-count');
        if (busStopCountEl) busStopCountEl.textContent = `Bus Stops: ${stops.length}`;
    } else if (trainToggle.classList.contains('active')) {
        // Only train active
        const trainStopCountEl = document.getElementById('train-stop-count');
        if (trainStopCountEl) trainStopCountEl.textContent = `Train Stops: ${stops.length}`;
    }
}

async function updateVehiclePositions(hours, minutes = 0) {
    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    console.log(`Updating vehicles for ${time}...`);

    if (!gtfsParser) {
        console.warn('Parser not initialized. Please load data first.');
        return;
    }
    
    // Check if full data is loaded
    if (!gtfsParser.hasFullData()) {
        console.log('Data still loading...');
        const vehicleCountEl = document.getElementById('vehicle-count');
        if (vehicleCountEl) vehicleCountEl.textContent = 'Vehicles: loading...';
        return;
    }

    const positions = gtfsParser.getAllVehiclePositions(time, ['arnhem']);
    
    // Clear markers for active transport types
    if (activeTransportTypes.has('bus')) clearMarkers('bus');
    if (activeTransportTypes.has('train')) clearMarkers('train');

    for (const pos of positions) {
        // Skip if not an active transport type
        if (!activeTransportTypes.has(pos.type)) continue;
        
        // Skip if specific lines are selected but this line is not
        if (pos.type === 'bus' && selectedBusLines.size > 0 && !selectedBusLines.has(pos.routeShortName)) continue;
        if (pos.type === 'train' && selectedTrainLines.size > 0 && !selectedTrainLines.has(pos.routeShortName)) continue;

        const marker = L.circleMarker([pos.lat, pos.lon], {
            radius: 6,
            fillColor: COLORS[pos.type],
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            className: `${pos.type}-marker`
        });

        const routeInfo = pos.routeShortName ? `Line ${pos.routeShortName}` : pos.routeId;
        const vehicleIcon = pos.type === 'bus' ? '🚌' : '🚆';
        marker.bindPopup(`
            <b>${pos.operator.toUpperCase()} - ${vehicleIcon} ${pos.type.charAt(0).toUpperCase() + pos.type.slice(1)}</b><br>
            Route: ${routeInfo}<br>
            Position: ${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}<br>
            Time: ${time}
        `).addTo(map);
        markers[pos.type].push(marker);
    }

    // Update vehicle counts
    const busCount = markers.bus.length;
    const trainCount = markers.train.length;
    const totalCount = busCount + trainCount;
    
    // Update counts based on what's visible
    const busToggle = document.getElementById('toggle-bus');
    const trainToggle = document.getElementById('toggle-train');
    
    if (busToggle.classList.contains('active') && trainToggle.classList.contains('active')) {
        // Both active - show total
        const vehicleCountEl = document.getElementById('vehicle-count');
        if (vehicleCountEl) vehicleCountEl.textContent = `Vehicles: ${totalCount}`;
    } else if (busToggle.classList.contains('active')) {
        // Only bus active
        const busCountEl = document.getElementById('bus-count');
        if (busCountEl) busCountEl.textContent = `Buses: ${busCount}`;
    } else if (trainToggle.classList.contains('active')) {
        // Only train active
        const trainCountEl = document.getElementById('train-count');
        if (trainCountEl) trainCountEl.textContent = `Trains: ${trainCount}`;
    }
    
    console.log(`Vehicles displayed: ${busCount} buses, ${trainCount} trains`);
}

function clearMarkers(type) {
    if (type === 'all') {
        ['bus', 'train', 'stops'].forEach(t => {
            if (markers[t]) {
                markers[t].forEach(marker => map.removeLayer(marker));
                markers[t] = [];
            }
        });
    } else {
        if (markers[type]) {
            markers[type].forEach(marker => map.removeLayer(marker));
            markers[type] = [];
        }
    }
}

function setupControls() {
    // Transport type toggles (bus and train)
    const busToggle = document.getElementById('toggle-bus');
    const trainToggle = document.getElementById('toggle-train');
    
    busToggle.addEventListener('click', function() {
        this.classList.toggle('active');
        updateActiveTransportTypes();
        updateVehiclePositions(parseInt(document.getElementById('time-range').value), 0);
    });
    
    trainToggle.addEventListener('click', function() {
        this.classList.toggle('active');
        updateActiveTransportTypes();
        updateVehiclePositions(parseInt(document.getElementById('time-range').value), 0);
    });
    
    // Initialize UI visibility
    updateUIVisibility();

    // Time slider (0-48 hours)
    const timeRange = document.getElementById('time-range');
    const timeDisplay = document.getElementById('time-display');
    timeRange.addEventListener('input', function() {
        const hours = parseFloat(this.value);
        const fullHours = Math.floor(hours);
        const minutes = Math.floor((hours % 1) * 60);
        const days = Math.floor(fullHours / 24);
        const hoursInDay = fullHours % 24;
        timeDisplay.textContent = days > 0 ? 
            `${days}d ${hoursInDay.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}` :
            `${fullHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        if ((busToggle.classList.contains('active') || trainToggle.classList.contains('active')) && gtfsParser) {
            updateVehiclePositions(fullHours, minutes);
        }
    });

    // Setup line selectors
    setupBusLineSelector();
    setupTrainLineSelector();
    
    // Update active transport types from initial button states
    updateActiveTransportTypes();
    
    // Update vehicles if data is already loaded
    if (gtfsParser && (busToggle.classList.contains('active') || trainToggle.classList.contains('active'))) {
        updateVehiclePositions(parseInt(timeRange.value), 0);
    }
    
    // Initialize vehicle count
    const vehicleCountEl = document.getElementById('vehicle-count');
    if (vehicleCountEl) {
        vehicleCountEl.textContent = 'Vehicles: loading...';
    }
}

function updateActiveTransportTypes() {
    activeTransportTypes.clear();
    
    const busToggle = document.getElementById('toggle-bus');
    const trainToggle = document.getElementById('toggle-train');
    
    if (busToggle.classList.contains('active')) {
        activeTransportTypes.add('bus');
    }
    if (trainToggle.classList.contains('active')) {
        activeTransportTypes.add('train');
    }
    
    // Update UI visibility
    updateUIVisibility();
    
    // If neither is active, clear all vehicle and stop markers
    if (activeTransportTypes.size === 0) {
        clearMarkers('bus');
        clearMarkers('train');
        clearMarkers('stops');
        document.getElementById('vehicle-count').textContent = 'Vehicles: 0';
        document.getElementById('stop-count').textContent = 'Stops: 0';
        return;
    }
    
    // Update stops based on active transport types
    updateStopsForTransportTypes();
    
    // Clear vehicle markers for inactive types
    if (!activeTransportTypes.has('bus')) {
        clearMarkers('bus');
    }
    if (!activeTransportTypes.has('train')) {
        clearMarkers('train');
    }
}

function updateUIVisibility() {
    const busToggle = document.getElementById('toggle-bus');
    const trainToggle = document.getElementById('toggle-train');
    
    // Show/hide line selectors
    const busControls = document.querySelector('.bus-controls');
    const trainControls = document.querySelector('.train-controls');
    
    if (busControls) {
        busControls.classList.toggle('hidden', !busToggle.classList.contains('active'));
    }
    if (trainControls) {
        trainControls.classList.toggle('hidden', !trainToggle.classList.contains('active'));
    }
    
    // Show/hide info panels
    const busInfo = document.querySelector('.bus-info');
    const trainInfo = document.querySelector('.train-info');
    const bothInfo = document.querySelector('.both-info');
    
    if (busInfo && trainInfo && bothInfo) {
        const showBoth = busToggle.classList.contains('active') && trainToggle.classList.contains('active');
        const showBusOnly = busToggle.classList.contains('active') && !trainToggle.classList.contains('active');
        const showTrainOnly = !busToggle.classList.contains('active') && trainToggle.classList.contains('active');
        
        bothInfo.classList.toggle('hidden', !showBoth);
        busInfo.classList.toggle('hidden', !showBusOnly);
        trainInfo.classList.toggle('hidden', !showTrainOnly);
    }
}

function setupBusLineSelector() {
    if (!gtfsParser) {
        setTimeout(setupBusLineSelector, 500);
        return;
    }

    const busLines = [...new Set(gtfsParser.routes
        .filter(r => r.route_type === '3') // Bus routes
        .map(r => r.route_short_name)
        .filter(name => name && name.trim() !== '')
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    )];

    const busSelector = document.getElementById('bus-line-selector');
    if (!busSelector) return;

    // Add bus line options (skip if already added)
    if (busSelector.options.length <= 1) { // Only "All Lines" exists
        busLines.forEach(line => {
            const option = document.createElement('option');
            option.value = line;
            option.textContent = line;
            busSelector.appendChild(option);
        });
    }

    // Handle selection changes
    busSelector.addEventListener('change', function() {
        handleLineSelection('bus', this, selectedBusLines);
        updateVehiclePositions(parseInt(document.getElementById('time-range').value), 0);
    });
}

function setupTrainLineSelector() {
    if (!gtfsParser) {
        setTimeout(setupTrainLineSelector, 500);
        return;
    }

    const trainLines = [...new Set(gtfsParser.routes
        .filter(r => r.route_type !== '3') // Train routes (not bus)
        .map(r => r.route_short_name)
        .filter(name => name && name.trim() !== '')
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    )];

    if (trainLines.length === 0) return;

    const trainSelector = document.getElementById('train-line-selector');
    if (!trainSelector) return;

    // Add train line options (skip if already added)
    if (trainSelector.options.length <= 1) { // Only "All Lines" exists
        trainLines.forEach(line => {
            const option = document.createElement('option');
            option.value = line;
            option.textContent = line;
            trainSelector.appendChild(option);
        });
    }

    // Handle selection changes
    trainSelector.addEventListener('change', function() {
        handleLineSelection('train', this, selectedTrainLines);
        updateVehiclePositions(parseInt(document.getElementById('time-range').value), 0);
    });
}

function handleLineSelection(type, selector, selectedLines) {
    const selectedOptions = Array.from(selector.selectedOptions).map(o => o.value);
    
    if (selectedOptions.includes('all')) {
        // If "all" is selected, select only it and clear line filters
        selectedLines.clear();
        Array.from(selector.options).forEach(opt => {
            if (opt.value === 'all') {
                opt.selected = true;
            } else {
                opt.selected = false;
            }
        });
        // Show all stops if bus is the only active type
        if (activeTransportTypes.size === 1 && activeTransportTypes.has('bus')) {
            displayStopsForLines(gtfsParser.stops, null);
        }
    } else {
        // Update selected lines
        selectedLines.clear();
        selectedOptions.forEach(line => {
            if (line !== 'all') {
                selectedLines.add(line);
            }
        });
        // Show stops for selected lines only (if bus is active)
        if (activeTransportTypes.has('bus') && selectedLines === selectedBusLines && selectedBusLines.size > 0) {
            const allLineStops = [];
            const lineStopsMap = new Map();
            
            for (const line of selectedBusLines) {
                const stops = gtfsParser.getStopsForRoute(line);
                lineStopsMap.set(line, stops);
                allLineStops.push(...stops);
            }
            
            displayStopsForLines(allLineStops, lineStopsMap);
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
