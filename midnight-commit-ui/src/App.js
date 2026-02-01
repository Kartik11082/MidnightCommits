import Globe from 'react-globe.gl';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import Dashboard from './Dashboard';
import './App.css';

// CONSTANTS
const MAX_COMMITS = 200;

// Vertex shader
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader for day/night with terminator glow
const fragmentShader = `
  uniform sampler2D u_dayTexture;
  uniform sampler2D u_nightTexture;
  uniform vec3 u_sunDirection;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 dayColor = texture2D(u_dayTexture, vUv).rgb;
    vec3 nightColor = texture2D(u_nightTexture, vUv).rgb;

    float cosAngleSunToNormal = dot(vNormal, u_sunDirection);
    float mixAmount = 1.0 / (1.0 + exp(-10.0 * cosAngleSunToNormal));
    
    vec3 color = mix(nightColor, dayColor, mixAmount);
    color = max(color, nightColor * 0.1);
    
    // Terminator glow (sunset/sunrise orange at the edge)
    float sunset = smoothstep(-0.1, 0.1, cosAngleSunToNormal) * (1.0 - smoothstep(0.0, 0.2, cosAngleSunToNormal));
    vec3 sunsetColor = vec3(1.0, 0.4, 0.1);
    color = mix(color, sunsetColor, sunset * 0.6);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

function App() {
  const globeRef = useRef();
  const [commits, setCommits] = useState([]);
  const [status, setStatus] = useState('Connecting...');
  const materialRef = useRef(null);

  // Helper: Check if a point is facing the sun (dot product)
  const isDaytimeAtLocation = useCallback((lat, lng, sunDirection) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = -(Math.sin(phi) * Math.cos(theta));
    const z = (Math.sin(phi) * Math.sin(theta));
    const y = (Math.cos(phi));

    const normal = new THREE.Vector3(x, y, z).normalize();
    return normal.dot(sunDirection) > -0.1;
  }, []);

  // Calculate sun direction
  const getSunDirection = useCallback(() => {
    const now = new Date();
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const sunLongitude = (utcHours - 12) * 15;
    const sunLngRad = sunLongitude * (Math.PI / 180);
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const sunLatRad = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365) * (Math.PI / 180);

    return new THREE.Vector3(
      -Math.cos(sunLatRad) * Math.sin(sunLngRad),
      Math.sin(sunLatRad),
      -Math.cos(sunLatRad) * Math.cos(sunLngRad)
    ).normalize();
  }, []);

  // Create shader material
  const globeMaterial = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        u_dayTexture: { value: loader.load('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg') },
        u_nightTexture: { value: loader.load('//unpkg.com/three-globe/example/img/earth-night.jpg') },
        u_sunDirection: { value: new THREE.Vector3(1, 0, 0) }
      },
      vertexShader,
      fragmentShader,
    });
    materialRef.current = material;
    return material;
  }, []);

  // Update sun direction
  useEffect(() => {
    const updateSun = () => {
      if (materialRef.current) {
        materialRef.current.uniforms.u_sunDirection.value = getSunDirection();
      }
    };
    updateSun();
    const interval = setInterval(updateSun, 60000);
    return () => clearInterval(interval);
  }, [getSunDirection]);

  // Fade out old commits
  useEffect(() => {
    const fadeInterval = setInterval(() => {
      setCommits(prev => prev.map((c, i) => ({
        ...c,
        opacity: Math.max(0.2, 1 - (prev.length - i) * 0.02)
      })).filter(c => c.opacity > 0.1));
    }, 2000);
    return () => clearInterval(fadeInterval);
  }, []);

  // WebSocket connection to backend
  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connect = () => {
      ws = new WebSocket("ws://localhost:8000/ws");

      ws.onopen = () => {
        setStatus('🟢 Connected');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        const currentSunDir = materialRef.current
          ? materialRef.current.uniforms.u_sunDirection.value
          : new THREE.Vector3(1, 0, 0);

        const isDay = isDaytimeAtLocation(data.lat, data.lon, currentSunDir);

        const newCommit = {
          id: Date.now() + Math.random(),
          lat: data.lat,
          lng: data.lon,
          size: 0.08,
          color: isDay ? "#FFD700" : "#00FFFF",
          label: `${data.user} (${data.city})`,
          opacity: 1
        };

        setCommits(prev => [...prev.slice(-MAX_COMMITS), newCommit]);
      };

      ws.onclose = () => {
        setStatus('🔴 Reconnecting...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setStatus('🔴 Error');
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [isDaytimeAtLocation]);

  // Ripple rings
  const ringsData = useMemo(() => {
    return commits.slice(-10).map(c => ({
      lat: c.lat,
      lng: c.lng,
      maxR: 3,
      propagationSpeed: 2,
      repeatPeriod: 1000,
      color: c.color
    }));
  }, [commits]);

  return (
    <div className="app-container">
      {/* Globe Header Section */}
      <div className="globe-header">
        <div className="header-content">
          <h1>🌙 Midnight Commits</h1>
          <p>Real-time GitHub activity visualization</p>
          <div className="status-bar">
            <span className="status">{status}</span>
            <span className="commit-count">{commits.length} commits</span>
            <span className="legend">
              <span className="dot day"></span> Day
              <span className="dot night"></span> Night
            </span>
          </div>
        </div>
        <div className="globe-container">
          <Globe
            ref={globeRef}
            globeMaterial={globeMaterial}
            backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
            pointsData={commits}
            pointAltitude="size"
            pointColor="color"
            pointRadius={0.3}
            pointLabel="label"
            ringsData={ringsData}
            ringColor="color"
            ringMaxRadius="maxR"
            ringPropagationSpeed="propagationSpeed"
            ringRepeatPeriod="repeatPeriod"
            animateIn={true}
            atmosphereColor="#4da6ff"
            atmosphereAltitude={0.15}
            width={600}
            height={400}
          />
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        <Dashboard />
      </div>
    </div>
  );
}

export default App;
