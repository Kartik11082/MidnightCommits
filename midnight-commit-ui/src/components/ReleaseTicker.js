const ReleaseTicker = ({ releases }) => (
    <div style={{ marginTop: '10px' }}>
        <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '5px' }}>
            {releases.length === 0 ? (
                <div style={{ color: '#444', fontStyle: 'italic', fontSize: '12px' }}>Waiting for releases...</div>
            ) : (
                releases.map((rel, i) => (
                    <div key={i} style={{
                        borderLeft: '2px solid #fff',
                        paddingLeft: '12px',
                        marginBottom: '12px',
                        fontSize: '12px'
                    }}>
                        <div style={{ color: '#fff', fontWeight: 'bold' }}>{rel.repo} <span style={{ color: '#888', fontWeight: 'normal' }}>v{rel.ref || '1.0'}</span></div>
                        <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{rel.city} • {rel.time}</div>
                    </div>
                ))
            )}
        </div>
    </div>
);

export default ReleaseTicker;
