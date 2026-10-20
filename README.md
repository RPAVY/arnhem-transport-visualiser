# Arnhem-Nijmegen Transport Visualizer

**A real-time public transport visualization tool for the Arnhem-Nijmegen region**

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18+-blue.svg)](https://expressjs.com/)

This project showcases my ability to work with:
- **Real-time data processing** (GTFS feeds from OVapi)
- **Geospatial filtering** (focus on Arnhem region)
- **Interactive data visualization** (Leaflet.js maps)
- **Full-stack JavaScript** (Node.js backend + frontend)
- **API design** (RESTful endpoints for data access)

## 📸 Preview

![Arnhem Transport Visualizer Screenshot](https://via.placeholder.com/800x500?text=Arnhem+Transport+Visualizer)

*Interactive map showing real-time bus and train positions in the Arnhem-Nijmegen region*

## ⚡ Features

- **Real-time vehicle tracking**: Simulates bus and train positions based on GTFS schedule data
- **Interactive map**: Built with Leaflet.js, supports both standard and satellite views
- **Geographic filtering**: Only shows data relevant to Arnhem-Nijmegen region
- **Line filtering**: Filter by specific bus or train lines
- **Time slider**: Adjust to see vehicle positions at any time of day
- **Responsive design**: Works on desktop and mobile devices

## 🏗️ Architecture

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
│   Browser   │───▶│  Node.js Server  │───▶│  OVapi      │
│   (Client)  │◀───│  (localhost:3000)│◀───│  gtfs-nl.zip │
└─────────────┘    └─────────────────┘    └─────────────┘
                          │
                     ┌────┴────┐
                     │ Cache   │
                     │ (24 hrs)│
                     └─────────┘
```

- **Frontend**: Pure HTML/CSS/JS with Leaflet.js for mapping
- **Backend**: Node.js + Express server that fetches and filters GTFS data
- **Data Source**: OVapi Netherlands GTFS feed (http://gtfs.ovapi.nl/)
- **No local storage**: Data is fetched from OVapi, filtered, and cached in memory

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

### 3. Open in Browser

Navigate to: **http://localhost:3000**

The first load will take 30-60 seconds as it downloads and filters the GTFS data from OVapi. Subsequent loads use cached data and are instant.

## 📂 Project Structure

```
arnhem-transport-visualizer/
├── server.js              # Express server - fetches & filters GTFS data
├── package.json           # Dependencies
├── LICENSE               # MIT License
├── README.md             # This file
└── public/               # Static files
    ├── index.html        # Main page
    ├── css/
    │   └── style.css     # Application styles
    └── js/
        ├── gtfs-parser.js # GTFS data parser
        └── main.js        # Application logic
```

## 🔌 How It Works

### Data Flow

1. **Server starts** and listens on port 3000
2. **Client requests** `/api/gtfs` endpoint
3. **Server checks cache** - if valid, returns cached data
4. **If cache miss** - downloads full Netherlands GTFS (~1.5 GB) from OVapi
5. **Server filters** data for Arnhem region (~1-5 MB)
6. **Server caches** filtered data for 24 hours
7. **Client renders** interactive map with vehicle positions

### Vehicle Position Calculation

The system doesn't use real-time GPS data. Instead, it:
1. Takes scheduled departure/arrival times from GTFS
2. Interpolates vehicle positions between stops based on current time
3. Calculates lat/lon coordinates along the route

This provides a realistic simulation of where vehicles *should* be based on the schedule.

## 🎨 Technologies Used

| Technology | Purpose |
|------------|---------|
| **Node.js** | Backend runtime |
| **Express** | Web server framework |
| **Axios** | HTTP client for OVapi |
| **JSZip** | ZIP file extraction |
| **Leaflet.js** | Interactive mapping |
| **OpenStreetMap** | Base map tiles |
| **GTFS** | General Transit Feed Specification |

## 🌍 Data Source

- **Provider**: OVapi (http://ovapi.nl/)
- **Feed URL**: http://gtfs.ovapi.nl/gtfs-nl.zip
- **Data**: Complete GTFS feed for the Netherlands
- **License**: Open data (publicly available)
- **Size**: ~1.5 GB (filtered to ~1-5 MB for Arnhem)

## 📊 Performance

- **First load**: 30-60 seconds (downloads from OVapi)
- **Subsequent loads**: <1 second (cached)
- **Memory usage**: ~500-800 MB during initial load, ~100-200 MB steady
- **Cache size**: ~1-5 MB
- **Cache TTL**: 24 hours (configurable)

## 🎯 Features in Detail

### Transport Types
- **Bus** (🚌): Blue markers on the map
- **Train** (🚆): Pink markers on the map
- **Stops** (📍): Orange markers on the map

### Controls
- **Toggle Buttons**: Switch between bus, train, or both
- **Line Selector**: Multi-select dropdown to filter by specific lines
- **Time Slider**: Adjust from 00:00 to 48:00 (2 full days)

### Information Panel
- Shows count of visible vehicles (buses/trains)
- Shows count of visible stops
- Updates in real-time as you adjust filters

## 💡 Use Cases

This project demonstrates:

1. **Data Processing**: Handling large datasets (1.5 GB GTFS) efficiently
2. **Geospatial Filtering**: Extracting relevant data for a specific region
3. **API Design**: Creating clean RESTful endpoints
4. **Real-time Visualization**: Interactive maps with dynamic data
5. **Full-stack Development**: Backend + Frontend integration

## 🔧 Customization

### Change Arnhem Bounds

Edit the bounds in `server.js`:
```javascript
const ARNHEM_BOUNDS = {
    minLat: 51.8,
    maxLat: 52.1,
    minLon: 5.7,
    maxLon: 6.2
};
```

### Change Cache TTL

```javascript
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
```

### Change Port

```javascript
const PORT = process.env.PORT || 3000;
```

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Data**: OVapi (http://gtfs.ovapi.nl/)
- **Mapping**: Leaflet.js (https://leafletjs.com/)
- **Base Maps**: OpenStreetMap (https://www.openstreetmap.org/)

---

**Built as a portfolio project to showcase full-stack JavaScript development**

*For demo purposes only. Not intended for production deployment.*
