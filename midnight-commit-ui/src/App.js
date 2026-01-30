import Globe from 'react-globe.gl';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
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

// Fragment shader for day/night
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
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

function App() {
  const globeRef = useRef();
  const [commits, setCommits] = useState([]);
  const [status, setStatus] = useState('Connecting...');
  const materialRef = useRef(null);

  // Calculate sun direction
  const getSunDirection = useCallback(() => {
    const now = new Date();
    const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const sunLng = ((12 - hours) * 15) * (Math.PI / 180);
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const sunLat = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365) * (Math.PI / 180);

    return new THREE.Vector3(
      Math.cos(sunLat) * Math.cos(sunLng),
      Math.sin(sunLat),
      Math.cos(sunLat) * Math.sin(sunLng)
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
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("New Commit:", data);

        const newCommit = {
          id: Date.now() + Math.random(),
          lat: data.lat,
          lng: data.lon,
          size: 0.08,  // Much smaller altitude
          color: data.status === "DAY" ? "#FFD700" : "#00FFFF",
          label: `${data.user} (${data.city})`,
          opacity: 1
        };

        // setCommits(prev => [...prev.slice(-50), newCommit]);
        setCommits(prev => [...prev.slice(MAX_COMMITS), newCommit]);
      };

      ws.onclose = () => {
        setStatus('🔴 Disconnected - Reconnecting...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setStatus('🔴 Connection Error');
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  // Custom ring data for pulse effect on new commits
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
    <div className="App">
      <div className="title-overlay">
        <h1>🌙 Midnight Commits</h1>
        <p>Real-time GitHub activity visualization</p>
        <div className="status">{status} • {commits.length} commits</div>
        <div className="legend">
          <span className="legend-item">
            <span className="dot day"></span> Day
          </span>
          <span className="legend-item">
            <span className="dot night"></span> Night
          </span>
        </div>
      </div>
      <Globe
        ref={globeRef}
        globeMaterial={globeMaterial}
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"

        // Points (commits)
        pointsData={commits}
        pointAltitude="size"
        pointColor="color"
        pointRadius={0.3}
        pointLabel="label"

        // Ripple rings for new commits
        ringsData={ringsData}
        ringColor="color"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"

        // Globe settings
        animateIn={true}
        atmosphereColor="#4da6ff"
        atmosphereAltitude={0.15}
      />
    </div>
  );
}

export default App;
