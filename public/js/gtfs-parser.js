// =============================================
// GTFS Parser for Arnhem Transport Visualizer
// - Fetches data from local server API
// - No local storage required
// - Filters data for Arnhem region server-side
// - Caching handled by server
// =============================================

class GTFSParser {
    constructor() {
        this.agencies = [];
        this.stops = [];
        this.routes = [];
        this.trips = [];
        this.stopTimes = [];
        this.calendar = [];
        this.calendarDates = [];
        this.shapes = [];
        this.cache = new Map(); // Cache pour les positions calculées
        this._indexed = false; // Indicateur que les données sont indexées
        this._stopTimesByTrip = new Map(); // stopTimes indexés par trip_id
        this._tripsByRoute = new Map(); // trips indexés par route_id
        this._routesById = new Map(); // routes indexées par route_id
        this._stopsById = new Map();
        this._tripsById = new Map();
        
        // API base URL - can be configured
        this.apiBaseUrl = window.GTFS_API_URL || '/api';
    }

    // =============================================
    // 1. Chargement des données GTFS via API
    // =============================================

    /**
     * Charge toutes les données GTFS pour Arnhem depuis l'API
     * @returns {Promise<boolean>} - Succès ou échec
     */
    async loadGTFSData(operator = 'arnhem') {
        console.log('📡 Chargement des données GTFS depuis l\'API...');
        const startTime = performance.now();

        try {
            const response = await fetch(`${this.apiBaseUrl}/gtfs`);
            
            if (!response.ok) {
                console.error(`❌ Erreur HTTP ${response.status} lors de la récupération des données GTFS`);
                this._handleLoadError(response.status);
                return false;
            }
            
            const data = await response.json();
            
            // Assign the parsed data
            this.agencies = data.agency || [];
            this.stops = data.stops || [];
            this.routes = data.routes || [];
            this.trips = data.trips || [];
            this.stopTimes = data.stop_times || [];
            this.calendar = data.calendar || [];
            this.calendarDates = data.calendar_dates || [];
            
            // Construire les index pour accélérer les requêtes
            this._buildIndexes();
            
            const loadTime = (performance.now() - startTime) / 1000;
            console.log(`✅ Données GTFS chargées en ${loadTime.toFixed(2)}s:`);
            console.log(`   - ${this.stops.length} arrêts`);
            console.log(`   - ${this.routes.length} routes`);
            console.log(`   - ${this.trips.length} trajets`);
            console.log(`   - ${this.stopTimes.length} horaires`);

            return true;
        } catch (error) {
            console.error(`❌ Erreur lors du chargement des données GTFS:`, error);
            this._handleLoadError();
            return false;
        }
    }

    /**
     * Gère les erreurs de chargement
     */
    _handleLoadError(statusCode) {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            let errorMessage = '<p style="color: red;">Error: Unable to load GTFS data.</p>';
            
            if (statusCode === 500) {
                errorMessage += '<p>Server error. Please check if the server is running.</p>';
            } else if (statusCode === 404) {
                errorMessage += '<p>API endpoint not found. Please start the server.</p>';
            } else {
                errorMessage += '<p>Please ensure the server is running: <code>npm start</code></p>';
            }
            
            loadingElement.innerHTML = errorMessage;
            loadingElement.classList.remove('hidden');
        }
    }

    /**
     * Vérifie si les données sont complètement chargées
     */
    hasFullData() {
        return this.trips && this.trips.length > 0 && 
               this.stopTimes && this.stopTimes.length > 0;
    }

    // =============================================
    // 2. Méthodes utilitaires (conservées pour compatibilité)
    // =============================================

    /**
     * Parse un CSV en tenant compte des champs entre guillemets
     * @param {string} text - Texte CSV
     * @returns {Array} - Tableau d'objets
     */
    parseCSV(text) {
        const lines = text.split('\n');
        if (lines.length < 2) return [];

        // Parse la première ligne (headers)
        const headers = this.parseCSVLine(lines[0]);
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = this.parseCSVLine(lines[i]);
            const entry = {};

            for (let j = 0; j < Math.min(headers.length, values.length); j++) {
                entry[headers[j]] = values[j].trim();
            }
            data.push(entry);
        }
        return data;
    }

    /**
     * Parse une ligne CSV (gère les champs avec virgules entre guillemets)
     * @param {string} line - Ligne CSV
     * @returns {Array} - Tableau des valeurs
     */
    parseCSVLine(line) {
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
        result.push(current); // Ajouter le dernier champ
        return result;
    }

    // =============================================
    // 3. Méthodes de filtrage géographique
    // =============================================

    /**
     * Retourne les arrêts situés autour d'Arnhem
     * @returns {Array} - Liste des arrêts filtrés
     */
    getArnhemStops() {
        // Coordonnées d'Arnhem élargies (en degrés)
        const bounds = {
            minLat: 51.8,
            maxLat: 52.1,
            minLon: 5.7,
            maxLon: 6.2
        };

        return this.stops.filter(stop => {
            const lat = parseFloat(stop.stop_lat);
            const lon = parseFloat(stop.stop_lon);
            return !isNaN(lat) && !isNaN(lon) &&
                   bounds.minLat <= lat && lat <= bounds.maxLat &&
                   bounds.minLon <= lon && lon <= bounds.maxLon;
        });
    }

    /**
     * Filtre les données pour ne garder que celles d'Arnhem
     */
    filterForArnhem() {
        console.log('🔍 Filtrage des données pour Arnhem...');

        // 1. Filtrer les arrêts
        const arnhemStops = this.getArnhemStops();
        const arnhemStopIds = new Set(arnhemStops.map(s => s.stop_id));
        this.stops = arnhemStops;

        // 2. Filtrer les trajets qui passent par Arnhem
        const arnhemTripIds = new Set();
        for (const st of this.stopTimes) {
            if (arnhemStopIds.has(st.stop_id)) {
                arnhemTripIds.add(st.trip_id);
            }
        }
        this.trips = this.trips.filter(t => arnhemTripIds.has(t.trip_id));

        // 3. Filtrer les horaires
        this.stopTimes = this.stopTimes.filter(st => arnhemStopIds.has(st.stop_id));

        // 4. Filtrer les routes
        const arnhemRouteIds = new Set(this.trips.map(t => t.route_id));
        this.routes = this.routes.filter(r => arnhemRouteIds.has(r.route_id));

        console.log(`✅ Données filtrées:
            ${this.stops.length} arrêts,
            ${this.routes.length} routes,
            ${this.trips.length} trajets,
            ${this.stopTimes.length} horaires`);
    }

    // =============================================
    // 4. Méthodes d'indexation
    // =============================================

    /**
     * Crée des index pour accélérer les requêtes
     */
    _buildIndexes() {
        if (this._indexed) return;
        
        // Indexer les stops par stop_id
        this._stopsById = new Map();
        for (const stop of this.stops) {
            this._stopsById.set(stop.stop_id, stop);
        }
        
        // Indexer les stopTimes par trip_id
        for (const st of this.stopTimes) {
            if (!this._stopTimesByTrip.has(st.trip_id)) {
                this._stopTimesByTrip.set(st.trip_id, []);
            }
            this._stopTimesByTrip.get(st.trip_id).push(st);
        }
        
        // Indexer les trips par trip_id
        this._tripsById = new Map();
        for (const trip of this.trips) {
            this._tripsById.set(trip.trip_id, trip);
            // Indexer les trips par route_id
            if (!this._tripsByRoute.has(trip.route_id)) {
                this._tripsByRoute.set(trip.route_id, []);
            }
            this._tripsByRoute.get(trip.route_id).push(trip);
        }
        
        // Indexer les routes par route_id
        for (const route of this.routes) {
            this._routesById.set(route.route_id, route);
        }
        
        this._indexed = true;
        console.log('✅ Index créés pour accélérer les requêtes');
    }

    // =============================================
    // 5. Méthodes de requête
    // =============================================

    /**
     * Get stops for a specific route
     * @param {string} routeShortName - Short name of the route
     * @returns {Array} - List of stops for this route
     */
    getStopsForRoute(routeShortName) {
        // Find the route by its short name
        const route = this.routes.find(r => r.route_short_name === routeShortName);
        if (!route) return [];
        
        // Find all trips for this route
        const trips = this.trips.filter(t => t.route_id === route.route_id);
        if (trips.length === 0) return [];
        
        // Find all stop_ids for these trips
        const stopIds = new Set();
        for (const trip of trips) {
            const tripStopTimes = this._stopTimesByTrip.get(trip.trip_id) || [];
            for (const st of tripStopTimes) {
                stopIds.add(st.stop_id);
            }
        }
        
        // Return matching stops
        return this.stops.filter(s => stopIds.has(s.stop_id));
    }

    /**
     * Get all stops for a specific transport type (bus or train)
     * @param {string} type - 'bus' or 'train'
     * @returns {Array} - List of stops for this transport type
     */
    getStopsForTransportType(type) {
        if (!this.hasFullData() || !this._indexed) {
            return this.stops; // Return all if not indexed yet
        }
        
        // Find all routes of the specified type
        const routeIds = new Set();
        for (const route of this.routes) {
            const routeType = route.route_type === '3' ? 'bus' : 'train';
            if (routeType === type) {
                routeIds.add(route.route_id);
            }
        }
        
        // Find all trips for these routes
        const tripIds = new Set();
        for (const routeId of routeIds) {
            const trips = this._tripsByRoute.get(routeId) || [];
            for (const trip of trips) {
                tripIds.add(trip.trip_id);
            }
        }
        
        // Find all stop_ids for these trips
        const stopIds = new Set();
        for (const tripId of tripIds) {
            const stopTimes = this._stopTimesByTrip.get(tripId) || [];
            for (const st of stopTimes) {
                stopIds.add(st.stop_id);
            }
        }
        
        // Return stops that are served by this transport type
        return this.stops.filter(s => stopIds.has(s.stop_id));
    }

    // =============================================
    // 6. Calcul des positions des véhicules
    // =============================================

    /**
     * Convertit une heure au format HH:MM:SS en secondes depuis minuit
     * @param {string} time - Heure au format HH:MM:SS
     * @returns {number} - Secondes depuis minuit
     */
    timeToSeconds(time) {
        const [h, m, s] = time.split(':').map(Number);
        return h * 3600 + m * 60 + s;
    }

    /**
     * Calcule la position interpolée d'un véhicule sur un trajet à un moment donné
     * @param {string} tripId - ID du trajet
     * @param {string} timeStr - Heure au format HH:MM:SS
     * @returns {Object|null} - Position avec lat, lon, routeId, type
     */
    getVehiclePosition(tripId, timeStr) {
        const time = this.timeToSeconds(timeStr);
        
        // Utiliser les horaires indexés pour ce trajet
        const tripStopTimes = this._stopTimesByTrip.get(tripId) || [];
        if (tripStopTimes.length === 0) return null;

        // Trouver le segment où se trouve le véhicule
        for (let i = 0; i < tripStopTimes.length - 1; i++) {
            const st1 = tripStopTimes[i];
            const st2 = tripStopTimes[i + 1];
            
            const depTime1 = this.timeToSeconds(st1.departure_time || st1.arrival_time);
            const arrTime2 = this.timeToSeconds(st2.arrival_time);
            
            // Si le véhicule est entre ces deux arrêts
            if (depTime1 <= time && time <= arrTime2) {
                // Utiliser les arrêts indexés
                const stop1 = this._stopsById.get(st1.stop_id);
                const stop2 = this._stopsById.get(st2.stop_id);
                
                if (!stop1 || !stop2) return null;
                
                const lat1 = parseFloat(stop1.stop_lat);
                const lon1 = parseFloat(stop1.stop_lon);
                const lat2 = parseFloat(stop2.stop_lat);
                const lon2 = parseFloat(stop2.stop_lon);
                
                // Calculer le ratio de progression
                const progress = (time - depTime1) / (arrTime2 - depTime1);
                
                // Interpolation linéaire
                const lat = lat1 + (lat2 - lat1) * progress;
                const lon = lon1 + (lon2 - lon1) * progress;
                
                // Trouver la route et l'agence pour ce trajet via les index
                const trip = this._tripsById.get(tripId);
                if (!trip) return null;
                
                const route = this._routesById.get(trip.route_id);
                const agency = route ? this.agencies.find(a => a.agency_id === route.agency_id) : null;
                // GTFS route_type: 3=Bus, others are train/rail
                const routeType = route && route.route_type === '3' ? 'bus' : 'train';
                
                return {
                    lat,
                    lon,
                    tripId,
                    routeId: route ? route.route_id : trip.route_id,
                    routeShortName: route ? route.route_short_name : null,
                    operator: agency ? agency.agency_name : 'Unknown',
                    type: routeType
                };
            }
        }
        return null;
    }

    /**
     * Get all vehicle positions for a given time
     * @param {string} time - Time in HH:MM:SS format
     * @param {Array} operators - Operators list (kept for compatibility)
     * @returns {Array} - List of vehicle positions (buses and trains)
     */
    getAllVehiclePositions(time, operators) {
        if (!this.hasFullData()) {
            return [];
        }
        
        if (!this._indexed) {
            this._buildIndexes();
        }
        
        const positions = [];
        const timeSec = this.timeToSeconds(time);
        const timeWindow = 3600; // 1 hour in seconds
        
        // Get all trip IDs that have stop_times in the current time window
        const relevantTripIds = new Set();
        
        for (const [tripId, tripStopTimes] of this._stopTimesByTrip) {
            for (const st of tripStopTimes) {
                const stTime = this.timeToSeconds(st.departure_time || st.arrival_time);
                if (Math.abs(stTime - timeSec) <= timeWindow) {
                    relevantTripIds.add(tripId);
                    break; // Found at least one stop in the window
                }
            }
        }
        
        // Calculate position for each relevant trip
        for (const tripId of relevantTripIds) {
            const vehiclePos = this.getVehiclePosition(tripId, time);
            if (vehiclePos) {
                positions.push(vehiclePos);
            }
        }
        
        return positions;
    }
}

// Export for CommonJS environments (Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GTFSParser;
}
