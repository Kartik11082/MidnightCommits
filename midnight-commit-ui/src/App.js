import Globe from 'react-globe.gl';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import Dashboard from './Dashboard';
import './App.css';

// CONSTANTS
const MAX_COMMITS = 150;
const API_BASE = 'http://localhost:8000';

// SHADERS (Monochrome Day/Night)
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D u_dayTexture;
  uniform sampler2D u_nightTexture;
  uniform vec3 u_sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    // Desaturated texture look for pro feel
    vec3 dayColor = texture2D(u_dayTexture, vUv).rgb; // grayscale?
    vec3 nightColor = texture2D(u_nightTexture, vUv).rgb * 0.5; // Dimmer night
    
    float cosAngle = dot(vNormal, u_sunDirection);
    float mixAmount = 1.0 / (1.0 + exp(-10.0 * cosAngle));
    
    vec3 color = mix(nightColor, dayColor, mixAmount);
    
    // Very subtle terminator
    float sunset = smoothstep(-0.1, 0.1, cosAngle) * (1.0 - smoothstep(0.0, 0.2, cosAngle));
    // White/Blue-ish terminator instead of orange
    color = mix(color, vec3(0.5, 0.6, 0.8), sunset * 0.3);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

function App() {
  const globeRef = useRef();
  const [commits, setCommits] = useState([]);
  const [status, setStatus] = useState('CONNECTING');
  const [totals, setTotals] = useState({ total_commits: 0, unique_users: 0, panic_commits: 0 });
  const materialRef = useRef(null);

  // --- 1. DATA (Totals) ---
  useEffect(() => {
    const fetchTotals = async () => {
      try {
        const res = await fetch(`${API_BASE}/stats/total`);
        const json = await res.json();
        if (!json.error) setTotals(json);
      } catch (e) { }
    };
    fetchTotals();
    const i = setInterval(fetchTotals, 5000);
    return () => clearInterval(i);
  }, []);

  // --- 2. GLOBE ---
  const getSunDirection = useCallback(() => {
    const now = new Date();
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const sunLng = (utcHours - 12) * 15;
    const sunLngRad = sunLng * (Math.PI / 180);
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const sunLatRad = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365) * (Math.PI / 180);
    return new THREE.Vector3(
      -Math.cos(sunLatRad) * Math.sin(sunLngRad),
      Math.sin(sunLatRad),
      -Math.cos(sunLatRad) * Math.cos(sunLngRad)
    ).normalize();
  }, []);

  const globeMaterial = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        u_dayTexture: { value: loader.load('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg') },
        u_nightTexture: { value: loader.load('//unpkg.com/three-globe/example/img/earth-night.jpg') },
        u_sunDirection: { value: new THREE.Vector3(1, 0, 0) }
      },
      vertexShader,
      fragmentShader,
    });
    materialRef.current = mat;
    return mat;
  }, []);

  useEffect(() => {
    const updateSun = () => {
      if (materialRef.current) materialRef.current.uniforms.u_sunDirection.value = getSunDirection();
    };
    updateSun();
    const i = setInterval(updateSun, 60000);
    return () => clearInterval(i);
  }, [getSunDirection]);

  // --- 3. WS ---
  useEffect(() => {
    let ws;
    const connect = () => {
      ws = new WebSocket("ws://localhost:8000/ws");
      ws.onopen = () => setStatus('ONLINE');
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const newCommit = {
          id: Date.now() + Math.random(),
          lat: data.lat,
          lng: data.lon,
          size: 0.1, // Fixed small size
          color: '#ffffff', // Pure white points
          label: `${data.user} (${data.city})`,
          repo: data.repo
        };
        setCommits(p => [newCommit, ...p].slice(0, MAX_COMMITS));
      };
      ws.onclose = () => { setStatus('OFFLINE'); setTimeout(connect, 3000); };
    };
    connect();
    return () => ws && ws.close();
  }, []);

  return (
    <div className="App">

      {/* LAYER 1: The Globe (Background) */}
      <div className="globe-layer">
        <Globe
          ref={globeRef}
          globeMaterial={globeMaterial}
          // Use a plain black background, no stars image
          backgroundColor="#000000"

          pointsData={commits}
          pointAltitude="size"
          pointColor="color"
          pointRadius={0.12} // Minimal dots
          pointResolution={8} // Low poly counts are fine
          pointLabel="label"

          animateIn={true}
          atmosphereColor="#111" // Dark atmosphere
          atmosphereAltitude={0.15}
        />
      </div>

      {/* LAYER 2: The Minimal UI Overlay */}
      <div className="dashboard-layout">

        {/* Top Bar */}
        <div className="top-nav">
          <div className="minimal-card">
            <h1>Midnight Commits</h1>
            <div style={{ display: 'flex', gap: '30px' }}>
              <div>
                <div className="stat-value">{totals.total_commits}</div>
                <div className="stat-label">Total Events</div>
              </div>
              <div>
                <div className="stat-value">{totals.panic_commits}</div>
                <div className="stat-label">Panic Index</div>
              </div>
            </div>
          </div>

          <div className="minimal-card" style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'ONLINE' ? '#10B981' : '#EF4444', boxShadow: status === 'ONLINE' ? '0 0 8px #10B981' : 'none' }}></div>
              <span style={{ fontSize: '11px', color: status === 'ONLINE' ? '#10B981' : '#EF4444', fontWeight: 600, letterSpacing: '0.5px' }}>
                SYSTEM {status}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Area */}
        <div className="bottom-panels">

          {/* Bottom Left: Live Feed */}
          <div className="minimal-card" style={{ width: '300px' }}>
            <h1>Incoming Feed</h1>
            <div className="feed-list" style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {commits.slice(0, 10).map((c, i) => (
                <div key={c.id} className="feed-item">
                  <div>
                    <span className="feed-user">{c.label.split('(')[0]}</span>
                    <span className="feed-repo">{c.repo}</span>
                  </div>
                  <span className="feed-loc">{c.label.split('(')[1]?.replace(')', '') || 'Unknown'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Right: Analytics */}
          <Dashboard />

        </div>
      </div>
    </div>
  );
}

export default App;
