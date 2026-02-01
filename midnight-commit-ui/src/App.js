
import Globe from 'react-globe.gl';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import InsightCard from './components/InsightCard';
import ActivityDonut from './components/charts/ActivityDonut';
import InnovationBar from './components/charts/InnovationBar';
import ReleaseTicker from './components/ReleaseTicker';
import './App.css';

// CONSTANTS
const MAX_COMMITS = 150;
const API_BASE = 'http://localhost:8000';

function App() {
  const globeRef = useRef();
  const [commits, setCommits] = useState([]);
  const [countries, setCountries] = useState({ features: [] });
  const [sunPos, setSunPos] = useState([]); // Will be set by useEffect

  // Stats State (Simulated for Demo)
  const [activityData, setActivityData] = useState([
    { name: 'Commits', value: 350 },
    { name: 'New Work', value: 45 },
    { name: 'Shipped', value: 25 }
  ]);

  const [innovationData, setInnovationData] = useState([
    { city: 'San Francisco', commits: 120, newRepos: 25 },
    { city: 'London', commits: 95, newRepos: 15 },
    { city: 'Bangalore', commits: 110, newRepos: 20 },
    { city: 'Berlin', commits: 70, newRepos: 12 },
    { city: 'New York', commits: 85, newRepos: 10 }
  ]);

  const [releases, setReleases] = useState([]);

  // --- DATA FETCHING ---
  useEffect(() => {
    // 1. Country Borders (GeoJSON)
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(res => res.json())
      .then(setCountries)
      .catch(err => console.error("Failed to load borders", err));
  }, []);

  // --- SUN CALCULATION ---
  const getSunLocation = useCallback(() => {
    const now = new Date();
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const sunLng = (12 - utcHours) * 15;
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const sunLat = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365);
    return { lat: sunLat, lng: sunLng, label: "The Sun (Real-time)" };
  }, []);

  useEffect(() => {
    setSunPos([getSunLocation()]);
    const i = setInterval(() => setSunPos([getSunLocation()]), 60000);
    return () => clearInterval(i);
  }, [getSunLocation]);


  // --- WEBSOCKET ---
  useEffect(() => {
    let ws;
    const connect = () => {
      ws = new WebSocket("ws://localhost:8000/ws");
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const isTag = data.type === 'CreateEvent' && data.ref_type === 'tag';
        const isDelete = data.type === 'DeleteEvent';
        const isCreate = data.type === 'CreateEvent';

        // Update Releases Ticker
        if (isTag) {
          setReleases(prev => [{
            repo: data.repo,
            ref: data.description?.replace('Created ', ''), // e.g. "v1.0"
            city: data.city,
            time: new Date().toLocaleTimeString()
          }, ...prev].slice(0, 10));
        }

        // Color Logic
        let color = '#00f3ff'; // Default Push (Cyan)
        if (isDelete) color = '#ff4444'; // Red
        else if (isTag) color = '#ffffff'; // White (Release)
        else if (isCreate) color = '#10B981'; // Green (Branch/Repo)

        const newCommit = {
          id: data.id || Date.now() + Math.random(),
          lat: data.lat,
          lng: data.lon,
          size: isTag ? 0.6 : (isDelete ? 0.3 : 0.2), // Huge size for Releases
          color: color,
          label: `${data.description || data.repo} (${data.city})`
        };
        setCommits(p => {
          if (p.some(c => c.id === newCommit.id)) return p;
          return [newCommit, ...p].slice(0, MAX_COMMITS);
        });

        // Simulate live chart updates
        if (Math.random() > 0.7) {
          setActivityData(prev => {
            const idx = isCreate ? 1 : (isDelete ? 2 : 0);
            const newData = [...prev];
            newData[idx] = { ...newData[idx], value: newData[idx].value + 1 };
            return newData;
          });
        }
      };
      ws.onclose = () => setTimeout(connect, 3000);
    };
    connect();
    return () => ws && ws.close();
  }, []);

  return (
    <div className="report-layout">

      {/* LEFT: Contextual Visualization */}
      <div className="globe-container">
        <Globe
          ref={globeRef}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          backgroundColor="#000000"
          atmosphereColor="#2a2a2a"
          atmosphereAltitude={0.1}
          polygonsData={countries.features}
          polygonCapColor={() => 'rgba(0, 0, 0, 0)'}
          polygonSideColor={() => 'rgba(0, 0, 0, 0)'}
          polygonStrokeColor={() => '#444'}
          polygonAltitude={0.01}
          pointsData={commits}
          pointAltitude={0.25}
          pointRadius={0.15}
          pointColor="color"
          pointResolution={16}
          pointLabel="label"
          customLayerData={sunPos}
          customThreeObject={(d) => {
            const group = new THREE.Group();
            const geometry = new THREE.SphereGeometry(3, 32, 32);
            const material = new THREE.MeshBasicMaterial({ color: '#FFD700' });
            group.add(new THREE.Mesh(geometry, material));
            const haloGeo = new THREE.SphereGeometry(3.5, 32, 32);
            const haloMat = new THREE.MeshBasicMaterial({ color: '#FFD700', transparent: true, opacity: 0.3 });
            group.add(new THREE.Mesh(haloGeo, haloMat));
            return group;
          }}
          customThreeObjectUpdate={(obj, d) => {
            Object.assign(obj.position, globeRef.current.getCoords(d.lat, d.lng, 2.5));
          }}
        />
        <div className="live-status">
          <span className="status-dot"></span> LIVE INGESTION: {commits.length} BUFFERED EVENTS
        </div>
      </div>

      {/* RIGHT: Data Engineering Report */}
      <div className="report-column">

        {/* Header */}
        <div style={{ marginBottom: '60px' }}>
          <h1 style={{ fontSize: '1.8rem', margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>Midnight Commits</h1>
          <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Real-time ingestion and analysis of global developer activity.
            <br />
            <span style={{ color: '#00f3ff', fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}>Architecture: Kafka + Postgres + React</span>
          </p>
        </div>

        {/* STORY 1: ACTIVITY BREAKDOWN */}
        <InsightCard
          title="Throughput Breakdown"
          description="Global mix of activity: Are people fixing things (Commits), starting new things (Creates), or shipping code (Deletes)?"
          sqlQuery={`SELECT event_type, COUNT(*) 
FROM commits 
GROUP BY event_type; `}
        >
          <ActivityDonut data={activityData} />
        </InsightCard>

        {/* STORY 2: INNOVATION LEADERBOARD */}
        <InsightCard
          title="Innovation Leaderboard"
          description="Which cities are maintaining legacy code (Push) vs. starting brand new projects (Create Repo)?"
          sqlQuery={`SELECT
city,
  COUNT(*) FILTER(WHERE event_type = 'PushEvent') as commits,
    COUNT(*) FILTER(WHERE event_type = 'CreateEvent' AND ref_type = 'repository') as new_repos
FROM commits
WHERE city IS NOT NULL
GROUP BY city
ORDER BY new_repos DESC
LIMIT 5; `}
        >
          <InnovationBar data={innovationData} />
        </InsightCard>

        {/* STORY 3: LIVE RELEASES */}
        <InsightCard
          title="🚀 Live Releases (Tags)"
          description="Real-time feed of software releases (Tags) being shipped to production right now."
          sqlQuery={`SELECT repo_name, ref_type, city, committed_at
FROM commits
WHERE event_type = 'CreateEvent' AND ref_type = 'tag'
ORDER BY committed_at DESC
LIMIT 10; `}
        >
          <ReleaseTicker releases={releases} />
        </InsightCard>

      </div>
    </div>
  );
}

export default App;
