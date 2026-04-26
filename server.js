const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname)));

const storiesRoutes = require('./routes_stories_v2');
app.use('/api/stories', storiesRoutes);

app.listen(process.env.PORT || 3001, () => {
  console.log('Server running');
});
