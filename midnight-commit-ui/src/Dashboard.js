import { useEffect, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const API_BASE = 'http://localhost:8000';

const Dashboard = () => {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`${API_BASE}/stats/leaderboard`);
                const json = await res.json();
                if (Array.isArray(json)) setData(json);
            } catch (e) {
                console.error("Dashboard fetch failed", e);
            }
        };
        fetchData();
        const i = setInterval(fetchData, 5000);
        return () => clearInterval(i);
    }, []);

    return (
        <div className="minimal-card">
            <h1>Top Active Zones</h1>

            <div style={{ height: '150px', width: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 0, right: 0 }}>
                        {/* Minimal Tooltip */}
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            contentStyle={{
                                background: '#000',
                                border: '1px solid #333',
                                color: '#fff',
                                fontSize: '12px',
                                borderRadius: '4px',
                                padding: '8px'
                            }}
                            itemStyle={{ color: '#fff' }}
                            labelStyle={{ color: '#888', marginBottom: '4px' }}
                        />
                        {/* Hidden Axis but keep data layout */}
                        <XAxis type="number" hide />
                        <Bar
                            dataKey="count"
                            fill="#333"            // Dark Gray Bars (Unfocused)
                            radius={[0, 4, 4, 0]}
                            barSize={8}            // Very thin elegant bars
                            animationDuration={800}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Custom Legend/List below chart for cleaner look */}
            <div style={{ marginTop: '16px' }}>
                {data.slice(0, 5).map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.03)' : 'none', paddingBottom: i < 4 ? '4px' : '0' }}>
                        <span style={{ color: '#888' }}>{i + 1}. {d.city}</span>
                        <span style={{ color: '#fff', fontWeight: 500 }}>{d.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
