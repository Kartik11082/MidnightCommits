import { useState } from 'react';

const InsightCard = ({ title, description, children, sqlQuery, pythonLogic }) => {
    const [showTech, setShowTech] = useState(false);

    return (
        <div className="insight-card">
            {/* 1. The Business Question */}
            <div className="card-header">
                <h3>{title}</h3>
                <p>{description}</p>
            </div>

            {/* 2. The Visualization */}
            <div className="card-viz">
                {children}
            </div>

            {/* 3. The Engineering "Proof" */}
            <div className="tech-footer">
                <button
                    className="tech-toggle"
                    onClick={() => setShowTech(!showTech)}
                >
                    {showTech ? 'Hide Engineering Logic' : 'View Engineering Logic_'}
                </button>

                {showTech && (
                    <div className="code-block">
                        {sqlQuery && (
                            <div className="code-section">
                                <span>SQL Aggregation:</span>
                                <pre><code>{sqlQuery}</code></pre>
                            </div>
                        )}
                        {pythonLogic && (
                            <div className="code-section">
                                <span>Python Transformation:</span>
                                <pre><code>{pythonLogic}</code></pre>
                            </div>
                        )}
                        <div className="pipeline-note">
                            <span>Pipeline:</span> Kafka Stream → Postgres RDS → FastAPI Endpoint
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InsightCard;
