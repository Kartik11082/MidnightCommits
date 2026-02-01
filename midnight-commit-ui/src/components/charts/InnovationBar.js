import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const InnovationBar = ({ data }) => {
    return (
        <div style={{ height: 200, width: '100%' }}>
            <ResponsiveContainer>
                <BarChart data={data} layout="vertical" barGap={4}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="city" type="category" width={80} stroke="#666" fontSize={11} tickLine={false} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#000', border: '1px solid #333' }} />
                    <Legend />

                    {/* Grey Bar = Maintenance (Commits) */}
                    <Bar name="Maintenance (Push)" dataKey="commits" fill="#333" barSize={8} radius={[0, 4, 4, 0]} />

                    {/* Green Bar = Innovation (New Repos) */}
                    <Bar name="Innovation (New)" dataKey="newRepos" fill="#10B981" barSize={8} radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default InnovationBar;
