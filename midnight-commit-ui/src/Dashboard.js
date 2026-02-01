import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie } from 'recharts';
import './Dashboard.css';

const API_BASE = 'http://localhost:8000';

const Dashboard = () => {
    const [leaderboard, setLeaderboard] = useState([]);
    const [hourly, setHourly] = useState([]);
    const [panic, setPanic] = useState([]);
    const [totals, setTotals] = useState({ total_commits: 0, unique_users: 0, unique_cities: 0, panic_commits: 0 });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [leaderRes, hourlyRes, panicRes, totalRes] = await Promise.all([
                    fetch(`${API_BASE}/stats/leaderboard`),
                    fetch(`${API_BASE}/stats/hourly`),
                    fetch(`${API_BASE}/stats/panic`),
                    fetch(`${API_BASE}/stats/total`)
                ]);

                const leaderData = await leaderRes.json();
                const hourlyData = await hourlyRes.json();
                const panicData = await panicRes.json();
                const totalData = await totalRes.json();

                if (Array.isArray(leaderData)) setLeaderboard(leaderData);
                if (Array.isArray(hourlyData)) setHourly(hourlyData);
                if (Array.isArray(panicData)) setPanic(panicData);
                if (!totalData.error) setTotals(totalData);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const COLORS = ['#00FFFF', '#00E5E5', '#00CCCC', '#00B3B3', '#009999'];
    const PANIC_COLORS = ['#4CAF50', '#FF6B35'];

    return (
        <div className="dashboard-grid">
            {/* Stats Overview */}
            <div className="chart-card stats-card">
                <h3>📊 At a Glance</h3>
                <div className="stats-grid">
                    <div className="stat-item">
                        <span className="stat-value">{totals.total_commits}</span>
                        <span className="stat-label">Total Commits</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{totals.unique_users}</span>
                        <span className="stat-label">Unique Users</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{totals.unique_cities}</span>
                        <span className="stat-label">Cities</span>
                    </div>
                    <div className="stat-item panic">
                        <span className="stat-value">{totals.panic_commits}</span>
                        <span className="stat-label">🔥 Panic Commits</span>
                    </div>
                </div>
            </div>

            {/* Leaderboard */}
            <div className="chart-card">
                <div className="question">Where do most developers code from?</div>
                <h3>🏆 Top Cities</h3>
                {leaderboard.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={leaderboard} layout="vertical" margin={{ left: 10, right: 20 }}>
                            <XAxis type="number" stroke="#666" fontSize={11} />
                            <YAxis dataKey="city" type="category" width={100} stroke="#888" fontSize={12} tickLine={false} />
                            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                {leaderboard.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="no-data">Collecting data...</p>
                )}
            </div>

            {/* Hourly Activity */}
            <div className="chart-card">
                <div className="question">When are developers most active?</div>
                <h3>⏰ Activity by Hour (UTC)</h3>
                {hourly.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={hourly} margin={{ left: 10, right: 20 }}>
                            <XAxis dataKey="hour" stroke="#666" fontSize={11} />
                            <YAxis stroke="#666" fontSize={11} />
                            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }} />
                            <Line type="monotone" dataKey="count" stroke="#00FFFF" strokeWidth={2} dot={{ fill: '#00FFFF' }} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="no-data">Collecting data...</p>
                )}
            </div>

            {/* Panic vs Normal */}
            <div className="chart-card">
                <div className="question">How many commits are "panic" fixes?</div>
                <h3>🔥 Panic vs Normal</h3>
                {panic.length > 0 ? (
                    <div className="panic-chart">
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie
                                    data={panic.map(p => ({ name: p.is_panic ? 'Panic' : 'Normal', value: p.count }))}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {panic.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={PANIC_COLORS[index % PANIC_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="panic-legend">
                            <span><span className="dot normal"></span> Normal</span>
                            <span><span className="dot panic"></span> Panic (fix/bug/urgent)</span>
                        </div>
                    </div>
                ) : (
                    <p className="no-data">Collecting data...</p>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
