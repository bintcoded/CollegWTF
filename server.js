const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const storiesRoutes = require('./routes_stories_v2');
app.use('/api/stories', storiesRoutes);

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});