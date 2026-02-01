-- Midnight Commits Database Schema

CREATE TABLE IF NOT EXISTS commits (
    id SERIAL PRIMARY KEY,
    github_user VARCHAR(255) NOT NULL,
    repo_name VARCHAR(255),
    language VARCHAR(100),
    city VARCHAR(255),
    country VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status VARCHAR(50),  -- 'DAY' or 'NIGHT'
    message_length INT,
    is_panic BOOLEAN DEFAULT FALSE,
    committed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for fast queries
CREATE INDEX IF NOT EXISTS idx_commits_city ON commits(city);
CREATE INDEX IF NOT EXISTS idx_commits_language ON commits(language);
CREATE INDEX IF NOT EXISTS idx_commits_time ON commits(committed_at);
CREATE INDEX IF NOT EXISTS idx_commits_panic ON commits(is_panic);
