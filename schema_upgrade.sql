CREATE TABLE IF NOT EXISTS majors (
  major_id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  slug VARCHAR(50),
  department VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS categories (
  category_id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  slug VARCHAR(50),
  description TEXT
);

CREATE TABLE IF NOT EXISTS stories (
  story_id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  upvote_count INTEGER DEFAULT 0,
  major_id INTEGER REFERENCES majors(major_id),
  category_id INTEGER REFERENCES categories(category_id),
  status VARCHAR(20) DEFAULT 'approved',
  published_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE stories ADD COLUMN IF NOT EXISTS title VARCHAR(200);

ALTER TABLE stories ADD COLUMN IF NOT EXISTS react_insane INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS react_nah INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS react_respect INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS react_downfall INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stories ADD COLUMN IF NOT EXISTS unhinged_score INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reactions (
  reaction_id SERIAL PRIMARY KEY,
  story_id INTEGER NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  fingerprint_hash VARCHAR(64) NOT NULL,
  reaction_key VARCHAR(20) NOT NULL CHECK (reaction_key IN ('insane','nah','respect','downfall')),
  reacted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, fingerprint_hash)
);

CREATE INDEX IF NOT EXISTS idx_reactions_story ON reactions(story_id);

UPDATE stories
SET react_insane = upvote_count
WHERE react_insane = 0 AND upvote_count > 0;


INSERT INTO majors (name, slug, department)
VALUES ('Computer Science', 'cs', 'Engineering');

INSERT INTO categories (name, slug, description)
VALUES ('Funny', 'funny', 'Funny stories');