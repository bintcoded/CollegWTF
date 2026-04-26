const express = require('express');
const crypto = require('crypto');
const pool = require('./db/pool');
const router = express.Router();

const UNHINGED_KEYWORDS = [
  'fail','failed','cried','crying','drunk','dropped','kicked out','expelled',
  'naked','panic','lost','arrested','broken','cheated','caught','wrong','crash',
  'zero','fired','missed','overslept','forgot','accident','disaster','ruined',
  'destroyed','ghost','blocked','withdrew','suspended','plagiarism',
];

function computeUnhingedScore(content) {
  if (!content) return 0;
  const lower = content.toLowerCase();
  let score = Math.min(content.length / 50, 4);
  UNHINGED_KEYWORDS.forEach(kw => {
    if (lower.includes(kw)) score += 2;
  });
  score += Math.min((content.match(/!/g) || []).length, 3);
  return Math.round(score);
}

function generateTitle(content) {
  if (!content) return '';
  const text = content.trim();
  const firstSentence = text.split(/[.!?]/)[0].trim();

  if (firstSentence.length <= 72) {
    return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
  }

  const words = firstSentence.split(' ');
  let title = '';

  for (const w of words) {
    if ((title + ' ' + w).trim().length > 68) break;
    title = (title + ' ' + w).trim();
  }

  return title.charAt(0).toUpperCase() + title.slice(1);
}

function fingerprint(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + '|' + ua).digest('hex');
}

router.get('/meta', async (req, res) => {
  try {
    const [majors, categories] = await Promise.all([
      pool.query('SELECT major_id, name, slug, department FROM majors ORDER BY name'),
      pool.query('SELECT category_id, name, slug, description FROM categories ORDER BY name'),
    ]);

    res.json({
      majors: majors.rows,
      categories: categories.rows
    });
  } catch (err) {
    console.error('GET /stories/meta error:', err);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { major, category, sort } = req.query;

    let query = `
      SELECT
        s.story_id, s.title, s.content, s.unhinged_score,
        s.react_insane, s.react_nah, s.react_respect, s.react_downfall,
        s.published_at,
        m.name AS major_name, m.slug AS major_slug,
        c.name AS category_name, c.slug AS category_slug
      FROM stories s
      JOIN majors m ON s.major_id = m.major_id
      JOIN categories c ON s.category_id = c.category_id
      WHERE s.status = 'approved'
    `;

    const params = [];

    if (major) {
      params.push(major);
      query += ` AND m.slug = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND c.slug = $${params.length}`;
    }

    query += sort === 'top'
      ? ' ORDER BY (s.react_insane + s.react_nah + s.react_respect + s.react_downfall) DESC, s.published_at DESC'
      : ' ORDER BY s.published_at DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /stories error:', err);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

router.get('/pending/all', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.story_id, s.title, s.content, s.status, s.submitted_at,
        m.name AS major_name,
        c.name AS category_name
      FROM stories s
      JOIN majors m ON s.major_id = m.major_id
      JOIN categories c ON s.category_id = c.category_id
      WHERE s.status = 'pending'
      ORDER BY s.submitted_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error('GET /stories/pending/all error:', err);
    res.status(500).json({ error: 'Failed to fetch pending stories' });
  }
});

router.get('/sotd', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.story_id, s.title, s.content, s.unhinged_score,
        s.react_insane, s.react_nah, s.react_respect, s.react_downfall,
        s.published_at,
        m.name AS major_name, m.slug AS major_slug,
        c.name AS category_name, c.slug AS category_slug,
        (s.react_insane + s.react_nah + s.react_respect + s.react_downfall) AS total_reactions
      FROM stories s
      JOIN majors m ON s.major_id = m.major_id
      JOIN categories c ON s.category_id = c.category_id
      WHERE s.status = 'approved'
        AND s.published_at >= NOW() - INTERVAL '24 hours'
      ORDER BY total_reactions DESC
      LIMIT 1
    `);

    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /stories/sotd error:', err);
    res.status(500).json({ error: 'Failed to fetch story of the day' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { content, major_id, category_id } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const trimmed = content.trim();

    if (trimmed.length < 20 || trimmed.length > 500) {
      return res.status(400).json({ error: 'content must be 20–500 characters' });
    }

    if (!major_id || !category_id) {
      return res.status(400).json({ error: 'major_id and category_id are required' });
    }

    const majorCheck = await pool.query(
      'SELECT major_id FROM majors WHERE major_id = $1',
      [major_id]
    );

    if (!majorCheck.rows.length) {
      return res.status(400).json({ error: 'Invalid major_id' });
    }

    const catCheck = await pool.query(
      'SELECT category_id FROM categories WHERE category_id = $1',
      [category_id]
    );

    if (!catCheck.rows.length) {
      return res.status(400).json({ error: 'Invalid category_id' });
    }

    const title = generateTitle(trimmed);
    const unhinged_score = computeUnhingedScore(trimmed);

    const { rows } = await pool.query(
      `INSERT INTO stories (content, title, major_id, category_id, unhinged_score, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING story_id, submitted_at`,
      [trimmed, title, major_id, category_id, unhinged_score]
    );

    res.status(201).json({
      message: 'Story submitted and pending moderation',
      story_id: rows[0].story_id,
      title,
      submitted_at: rows[0].submitted_at,
    });
  } catch (err) {
    console.error('POST /stories error:', err);
    res.status(500).json({ error: 'Failed to submit story' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const storyId = parseInt(req.params.id);

    if (isNaN(storyId)) {
      return res.status(400).json({ error: 'Invalid story ID' });
    }

    await pool.query(
      `UPDATE stories
       SET status = 'approved', published_at = NOW()
       WHERE story_id = $1`,
      [storyId]
    );

    res.json({ message: 'Story approved' });
  } catch (err) {
    console.error('POST /stories/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve story' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const storyId = parseInt(req.params.id);

    if (isNaN(storyId)) {
      return res.status(400).json({ error: 'Invalid story ID' });
    }

    await pool.query(
      `UPDATE stories
       SET status = 'rejected'
       WHERE story_id = $1`,
      [storyId]
    );

    res.json({ message: 'Story rejected' });
  } catch (err) {
    console.error('POST /stories/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject story' });
  }
});

router.post('/:id/react', async (req, res) => {
  const client = await pool.connect();

  try {
    const storyId = parseInt(req.params.id);
    const { reaction } = req.body;
    const validReactions = ['insane', 'nah', 'respect', 'downfall'];

    if (isNaN(storyId)) {
      return res.status(400).json({ error: 'Invalid story ID' });
    }

    if (!validReactions.includes(reaction)) {
      return res.status(400).json({ error: 'Invalid reaction key' });
    }

    const fp = fingerprint(req);

    const storyCheck = await client.query(
      `SELECT story_id FROM stories WHERE story_id = $1 AND status = 'approved'`,
      [storyId]
    );

    if (!storyCheck.rows.length) {
      return res.status(404).json({ error: 'Story not found' });
    }

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT reaction_key FROM reactions
       WHERE story_id = $1 AND fingerprint_hash = $2`,
      [storyId, fp]
    );

    if (existing.rows.length) {
      const prev = existing.rows[0].reaction_key;

      if (prev === reaction) {
        await client.query(
          `DELETE FROM reactions
           WHERE story_id = $1 AND fingerprint_hash = $2`,
          [storyId, fp]
        );

        await client.query(
          `UPDATE stories
           SET react_${reaction} = GREATEST(0, react_${reaction} - 1)
           WHERE story_id = $1`,
          [storyId]
        );
      } else {
        await client.query(
          `UPDATE reactions
           SET reaction_key = $1, reacted_at = NOW()
           WHERE story_id = $2 AND fingerprint_hash = $3`,
          [reaction, storyId, fp]
        );

        await client.query(
          `UPDATE stories
           SET react_${prev} = GREATEST(0, react_${prev} - 1),
               react_${reaction} = react_${reaction} + 1
           WHERE story_id = $1`,
          [storyId]
        );
      }
    } else {
      await client.query(
        `INSERT INTO reactions (story_id, fingerprint_hash, reaction_key)
         VALUES ($1, $2, $3)`,
        [storyId, fp, reaction]
      );

      await client.query(
        `UPDATE stories
         SET react_${reaction} = react_${reaction} + 1
         WHERE story_id = $1`,
        [storyId]
      );
    }

    await client.query('COMMIT');

    const { rows } = await client.query(
      `SELECT react_insane, react_nah, react_respect, react_downfall
       FROM stories
       WHERE story_id = $1`,
      [storyId]
    );

    res.json({
      reactions: rows[0],
      your_reaction: existing.rows[0]?.reaction_key === reaction ? null : reaction
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /stories/:id/react error:', err);
    res.status(500).json({ error: 'Failed to record reaction' });
  } finally {
    client.release();
  }
});

module.exports = router;